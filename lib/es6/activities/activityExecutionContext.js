"use strict";

let ActivityExecutionState = require("./activityExecutionState");
let ResumeBookmarkQueue = require("./resumeBookmarkQueue");
let enums = require("../common/enums");
let errors = require("../common/errors");
let util = require("util");
let EventEmitter = require("events").EventEmitter;
let _ = require("lodash");
let constants = require("../common/constants");
let ScopeTree = require("./scopeTree");
let is = require("../common/is");
let CallContext = require("./callContext");
let assert = require("better-assert");
let Bluebird = require("bluebird");
let converters = require("../common/converters");

function ActivityExecutionContext(engine) {
    EventEmitter.call(this);

    this._activityStates = new Map();
    this._bookmarks = new Map();
    this._resumeBMQueue = new ResumeBookmarkQueue();
    this.rootActivity = null;
    this._knownActivities = new Map();
    this._scopeTree = this._createScopeTree();
    this.engine = engine; // Could be null in special cases, see workflowRegistry.js
}

util.inherits(ActivityExecutionContext, EventEmitter);

Object.defineProperties(
    ActivityExecutionContext.prototype,
    {
        scope: {
            get: function () {
                return this._scopeTree.currentScope;
            }
        },
        hasScope: {
            get: function () {
                return !this._scopeTree.isOnInitial;
            }
        }
    }
);

ActivityExecutionContext.prototype._createScopeTree = function () {
    let self = this;
    return new ScopeTree(
        {
            resultCollected: function (context, reason, result, bookmarkName) {
                context.activity.resultCollected.call(context.scope, context, reason, result, bookmarkName);
            }
        },
        function (id) {
            return self._getKnownActivity(id);
        });
};

ActivityExecutionContext.prototype.initialize = function (rootActivity) {
    if (this.rootActivity) {
        throw new Error("Context is already initialized.");
    }
    if (!is.activity(rootActivity)) {
        throw new TypeError("Argument 'rootActivity' value is not an activity.");
    }

    this.rootActivity = rootActivity;
    this._initialize(null, rootActivity, { instanceId: 0 });
};

ActivityExecutionContext.prototype._checkInit = function () {
    if (!this.rootActivity) {
        throw new Error("Context is not initialized.");
    }
};

ActivityExecutionContext.prototype._initialize = function (parent, activity, idCounter) {
    let activityId = activity._instanceId;
    let nextId = (idCounter.instanceId++).toString();
    if (!activityId) {
        activityId = nextId;
        activity.instanceId = activityId;
    }
    else if (activityId !== nextId) {
        throw new errors.ActivityRuntimeError("Activity " + activity + " has been assigned to an other position.");
    }

    let state = this.getExecutionState(activityId);
    state.parentInstanceId = parent ? parent.instanceId : null;
    this._knownActivities.set(activityId, activity);

    for (let child of activity.immediateChildren(this)) {
        this._initialize(activity, child, idCounter);
        state.childInstanceIds.add(child.instanceId);
    }
};

ActivityExecutionContext.prototype.getExecutionState = function (idOrActivity) {
    let self = this;

    let id;
    if (_.isString(idOrActivity)) {
        id = idOrActivity;
    }
    else if (is.activity(idOrActivity)) {
        id = idOrActivity.instanceId;
    }
    else {
        throw new TypeError("Cannot get state of " + idOrActivity);
    }
    let state = self._activityStates.get(id);
    if (_.isUndefined(state)) {
        state = new ActivityExecutionState(id);
        state.on(
            enums.activityStates.run,
            function (args) {
                self.emit(enums.activityStates.run, args);
            });
        state.on(
            enums.activityStates.end,
            function (args) {
                self.emit(enums.activityStates.end, args);
            });
        self._activityStates.set(id, state);
    }
    return state;
};

ActivityExecutionContext.prototype._getKnownActivity = function (activityId) {
    let activity = this._knownActivities.get(activityId);
    if (!activity) {
        throw new errors.ActivityRuntimeError("Activity by id '" + activityId + "' not found.");
    }
    return activity;
};

ActivityExecutionContext.prototype.createBookmark = function (activityId, name, endCallback) {
    this.registerBookmark(
        {
            name: name,
            instanceId: activityId,
            timestamp: new Date().getTime(),
            endCallback: endCallback
        });
    return name;
};

ActivityExecutionContext.prototype.registerBookmark = function (bookmark) {
    let bm = this._bookmarks.get(bookmark.name);
    if (bm) {
        throw new errors.ActivityRuntimeError("Bookmark '" + bookmark.name + "' already exists.");
    }
    this._bookmarks.set(bookmark.name, bookmark);
};

ActivityExecutionContext.prototype.isBookmarkExists = function (name) {
    return this._bookmarks.has(name);
};

ActivityExecutionContext.prototype.getBookmarkTimestamp = function (name, throwIfNotFound) {
    let bm = this._bookmarks.get(name);
    if (_.isUndefined(bm) && throwIfNotFound) {
        throw new Error("Bookmark '" + name + "' not found.");
    }
    return bm ? bm.timestamp : null;
};

ActivityExecutionContext.prototype.deleteBookmark = function (name) {
    this._bookmarks.delete(name);
};

ActivityExecutionContext.prototype.noopCallbacks = function (bookmarkNames) {
    for (let name of bookmarkNames) {
        let bm = this._bookmarks.get(name);
        if (bm) {
            bm.endCallback = _.noop;
        }
    }
};

ActivityExecutionContext.prototype.resumeBookmarkInScope = function (callContext, name, reason, result) {
    let bm = this._bookmarks.get(name);
    if (_.isUndefined(bm)) {
        throw new Error("Bookmark '" + name + "' doesn't exists. Cannot continue with reason: " + reason + ".");
    }
    let self = this;
    return new Bluebird(function (resolve, reject) {
        setImmediate(function () {
            try {
                bm = self._bookmarks.get(name);
                if (bm) {
                    // If bm is still exists.
                    self._doResumeBookmark(callContext, bm, reason, result, reason === enums.activityStates.idle);
                    resolve(true);
                }
                resolve(false);
            }
            catch (e) {
                reject(e);
            }
        });
    });
};

ActivityExecutionContext.prototype.resumeBookmarkInternal = function (callContext, name, reason, result) {
    let bm = this._bookmarks.get(name);
    this._resumeBMQueue.enqueue(name, reason, result);
};

ActivityExecutionContext.prototype.resumeBookmarkExternal = function (name, reason, result) {
    let self = this;
    let bm = self._bookmarks.get(name);
    if (!bm) {
        throw new errors.BookmarkNotFoundError("Internal resume bookmark request cannot be processed because bookmark '" + name + "' doesn't exists.");
    }
    self._doResumeBookmark(new CallContext(this, bm.instanceId), bm, reason, result);
};

ActivityExecutionContext.prototype.processResumeBookmarkQueue = function () {
    let self = this;
    let command = self._resumeBMQueue.dequeue();
    if (command) {
        let bm = self._bookmarks.get(command.name);
        if (!bm) {
            throw new errors.BookmarkNotFoundError("Internal resume bookmark request cannot be processed because bookmark '" + command.name + "' doesn't exists.");
        }
        self._doResumeBookmark(new CallContext(this, bm.instanceId), bm, command.reason, command.result);
        return true;
    }
    return false;
};

ActivityExecutionContext.prototype._doResumeBookmark = function (callContext, bookmark, reason, result, noRemove) {
    let scope = callContext.scope;
    if (!noRemove) {
        this._bookmarks.delete(bookmark.name);
    }
    let cb = bookmark.endCallback;
    if (_.isString(cb)) {
        cb = scope[bookmark.endCallback];
        if (!_.isFunction(cb)) {
            cb = null;
        }
    }

    if (!cb) {
        throw new errors.ActivityRuntimeError("Bookmark's '" + bookmark.name + "' callback '" + bookmark.endCallback + "' is not defined on the current scope.");
    }

    // TODO: if it fails, resume on default callback with the error!
    cb.call(scope, callContext, reason, result, bookmark);
};

ActivityExecutionContext.prototype.cancelExecution = function (scope, activityIds) {
    let self = this;
    let allIds = new Set();
    for (let id of activityIds) {
        self._cancelSubtree(scope, allIds, id);
    }
    for (let bm of self._bookmarks.values()) {
        if (allIds.has(bm.instanceId)) {
            self._bookmarks.delete(bm.name);
        }
    }
};

ActivityExecutionContext.prototype._cancelSubtree = function (scope, allIds, activityId) {
    let self = this;
    allIds.add(activityId);
    let state = self.getExecutionState(activityId);
    for (let id of state.childInstanceIds.values()) {
        self._cancelSubtree(scope, allIds, id);
    }
    state.reportState(enums.activityStates.cancel, null, scope);
};

ActivityExecutionContext.prototype.deleteScopeOfActivity = function (callContext, activityId) {
    this._scopeTree.deleteScopePart(callContext.instanceId, activityId);
};

ActivityExecutionContext.prototype.emitWorkflowEvent = function (args) {
    this.emit(enums.events.workflowEvent, args);
};

/* SERIALIZATION */

ActivityExecutionContext.prototype.getStateAndPromotions = function (serializer, enablePromotions) {
    if (serializer && !_.isFunction(serializer.toJSON)) {
        throw new TypeError("Argument 'serializer' is not a serializer.");
    }

    let activityStates = new Map();
    for (let s of this._activityStates.values()) {
        activityStates.set(s.instanceId, s.asJSON());
    }

    let scopeStateAndPromotions = this._scopeTree.getExecutionState(this, enablePromotions, serializer);

    let serialized;
    if (serializer) {
        serialized = serializer.toJSON({
            activityStates: activityStates,
            bookmarks: this._bookmarks,
            scope: scopeStateAndPromotions.state
        });
    }
    else {
        serialized = {
            activityStates: converters.mapToArray(activityStates),
            bookmarks: converters.mapToArray(this._bookmarks),
            scope: scopeStateAndPromotions.state
        };
    }

    return {
        state: serialized,
        promotedProperties: scopeStateAndPromotions.promotedProperties
    };
};

ActivityExecutionContext.prototype.setState = function (serializer, json) {
    if (serializer && !_.isFunction(serializer.fromJSON)) {
        throw new TypeError("Argument 'serializer' is not a serializer.");
    }
    if (!_.isObject(json)) {
        throw new TypeError("Argument 'json' is not an object.");
    }

    if (serializer) {
        json = serializer.fromJSON(json);
        if (!(json.activityStates instanceof Map)) {
            throw new TypeError("activityStates property value of argument 'json' is not an Map instance.");
        }
        if (!(json.bookmarks instanceof Map)) {
            throw new TypeError("Bookmarks property value of argument 'json' is not an Map instance.");
        }
    }
    else {
        if (!json.activityStates) {
            throw new TypeError("activityStates property value of argument 'json' is not an object.");
        }
        if (!json.bookmarks) {
            throw new TypeError("Bookmarks property value of argument 'json' is not an object.");
        }

        json = {
            activityStates: converters.arrayToMap(json.activityStates),
            bookmarks: converters.arrayToMap(json.bookmarks),
            scope: json.scope
        };
    }

    for (let s of this._activityStates.values()) {
        let stored = json.activityStates.get(s.instanceId);
        if (_.isUndefined(stored)) {
            throw new Error("Activity's of '" + s.instanceId + "' state not found.");
        }
        s.fromJSON(stored);
    }

    this._bookmarks = json.bookmarks;
    this._scopeTree.setState(json.scope, serializer);
};
/* SERIALIZATION */

module.exports = ActivityExecutionContext;