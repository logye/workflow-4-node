"use strict";
var Activity = require("./activity");
var util = require("util");
var _ = require("lodash");
function Emit() {
  Activity.call(this);
}
util.inherits(Emit, Activity);
Emit.prototype.run = function(callContext, args) {
  callContext.schedule(args, "_argsGot");
};
Emit.prototype._argsGot = function(callContext, reason, result) {
  if (reason !== Activity.states.complete) {
    callContext.end(reason, result);
    return;
  }
  if (result && result.length) {
    callContext.emitWorkflowEvent(result);
  }
  callContext.complete();
};
module.exports = Emit;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImVtaXQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFFQSxBQUFJLEVBQUEsQ0FBQSxRQUFPLEVBQUksQ0FBQSxPQUFNLEFBQUMsQ0FBQyxZQUFXLENBQUMsQ0FBQztBQUNwQyxBQUFJLEVBQUEsQ0FBQSxJQUFHLEVBQUksQ0FBQSxPQUFNLEFBQUMsQ0FBQyxNQUFLLENBQUMsQ0FBQztBQUMxQixBQUFJLEVBQUEsQ0FBQSxDQUFBLEVBQUksQ0FBQSxPQUFNLEFBQUMsQ0FBQyxRQUFPLENBQUMsQ0FBQztBQUV6QixPQUFTLEtBQUcsQ0FBRSxBQUFELENBQUc7QUFDWixTQUFPLEtBQUssQUFBQyxDQUFDLElBQUcsQ0FBQyxDQUFDO0FBQ3ZCO0FBQUEsQUFFQSxHQUFHLFNBQVMsQUFBQyxDQUFDLElBQUcsQ0FBRyxTQUFPLENBQUMsQ0FBQztBQUU3QixHQUFHLFVBQVUsSUFBSSxFQUFJLFVBQVUsV0FBVSxDQUFHLENBQUEsSUFBRyxDQUFHO0FBQzlDLFlBQVUsU0FBUyxBQUFDLENBQUMsSUFBRyxDQUFHLFdBQVMsQ0FBQyxDQUFDO0FBQzFDLENBQUM7QUFFRCxHQUFHLFVBQVUsU0FBUyxFQUFJLFVBQVMsV0FBVSxDQUFHLENBQUEsTUFBSyxDQUFHLENBQUEsTUFBSyxDQUFHO0FBQzVELEtBQUksTUFBSyxJQUFNLENBQUEsUUFBTyxPQUFPLFNBQVMsQ0FBRztBQUNyQyxjQUFVLElBQUksQUFBQyxDQUFDLE1BQUssQ0FBRyxPQUFLLENBQUMsQ0FBQztBQUMvQixVQUFNO0VBQ1Y7QUFBQSxBQUVBLEtBQUksTUFBSyxHQUFLLENBQUEsTUFBSyxPQUFPLENBQUc7QUFDekIsY0FBVSxrQkFBa0IsQUFBQyxDQUFDLE1BQUssQ0FBQyxDQUFDO0VBQ3pDO0FBQUEsQUFFQSxZQUFVLFNBQVMsQUFBQyxFQUFDLENBQUM7QUFDMUIsQ0FBQztBQUVELEtBQUssUUFBUSxFQUFJLEtBQUcsQ0FBQztBQUFBIiwiZmlsZSI6ImFjdGl2aXRpZXMvZW1pdC5qcyIsInNvdXJjZVJvb3QiOiJsaWIvZXM2Iiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbmxldCBBY3Rpdml0eSA9IHJlcXVpcmUoXCIuL2FjdGl2aXR5XCIpO1xubGV0IHV0aWwgPSByZXF1aXJlKFwidXRpbFwiKTtcbmxldCBfID0gcmVxdWlyZShcImxvZGFzaFwiKTtcblxuZnVuY3Rpb24gRW1pdCgpIHtcbiAgICBBY3Rpdml0eS5jYWxsKHRoaXMpO1xufVxuXG51dGlsLmluaGVyaXRzKEVtaXQsIEFjdGl2aXR5KTtcblxuRW1pdC5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKGNhbGxDb250ZXh0LCBhcmdzKSB7XG4gICAgY2FsbENvbnRleHQuc2NoZWR1bGUoYXJncywgXCJfYXJnc0dvdFwiKTtcbn07XG5cbkVtaXQucHJvdG90eXBlLl9hcmdzR290ID0gZnVuY3Rpb24oY2FsbENvbnRleHQsIHJlYXNvbiwgcmVzdWx0KSB7XG4gICAgaWYgKHJlYXNvbiAhPT0gQWN0aXZpdHkuc3RhdGVzLmNvbXBsZXRlKSB7XG4gICAgICAgIGNhbGxDb250ZXh0LmVuZChyZWFzb24sIHJlc3VsdCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgY2FsbENvbnRleHQuZW1pdFdvcmtmbG93RXZlbnQocmVzdWx0KTtcbiAgICB9XG5cbiAgICBjYWxsQ29udGV4dC5jb21wbGV0ZSgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFbWl0OyJdfQ==