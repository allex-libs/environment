function createCommandBase (lib) {
  'use strict';

  function CommandBase () {
  };
  CommandBase.prototype.destroy = lib.dummyFunc;
  CommandBase.prototype.execute = function (args) {
    if (!lib.isArray(args)) {
      console.warn('Supressing command execution');
      return lib.q.reject(new lib.Error('ARGUMENTS_FOR_COMMAND_EXECUTION_MUST_BE_AN_ARRAY', 'Arguments for comand execution have to be in a single Array'));
    }
    return this.doExecute(args);
  };
  CommandBase.prototype.doExecute = function (args) {
    throw new Error('CommandBase does not implement the doExecute method, descendant needs to override');
  };

  return CommandBase;
}

module.exports = createCommandBase;
