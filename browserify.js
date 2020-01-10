var lR = ALLEX.execSuite.libRegistry;
lR.register('allex_environmentlib',require('./src/libindex')(
  ALLEX,
  lR.get('allex_leveldblib'),
  lR.get('allex_userrepresentationlib')
));
ALLEX.WEB_COMPONENTS.allex_environmentlib = lR.get('allex_environmentlib');
