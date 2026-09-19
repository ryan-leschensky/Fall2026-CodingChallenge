const { Permission, isPermission, hasPermission } = require('../lib/permissions');

describe('Permission', () => {
  test('Should list the levels the database enum declares', () => {
    expect(Object.values(Permission)).toEqual(['view', 'edit', 'own']);
    expect(Object.isFrozen(Permission)).toBe(true);
  });

  test.each(['view', 'edit', 'own'])('Should recognise %s', value => {
    expect(isPermission(value)).toBe(true);
  });

  test.each(['VIEW', 'admin', '', null, undefined, 1, 'toString', '__proto__'])(
    'Should reject %p',
    value => {
      expect(isPermission(value)).toBe(false);
    },
  );

  test.each([
    ['view', 'view', true],
    ['view', 'edit', false],
    ['view', 'own', false],
    ['edit', 'view', true],
    ['edit', 'edit', true],
    ['edit', 'own', false],
    ['own', 'view', true],
    ['own', 'edit', true],
    ['own', 'own', true],
    [null, 'view', false],
    [undefined, 'view', false],
    ['admin', 'view', false],
  ])('%p has %p: %p', (actual, required, expected) => {
    expect(hasPermission(actual, required)).toBe(expected);
  });

  test('Should throw for an unknown required level, so typos fail loudly', () => {
    expect(() => hasPermission('own', 'admin')).toThrow(TypeError);
  });
});
