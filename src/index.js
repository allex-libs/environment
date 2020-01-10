function createLib (execlib) {
  return execlib.loadDependencies('client', ['allex_leveldblib', 'allex_userrepresentationlib'], require('./libindex').bind(null, execlib));
}

module.exports = createLib;
