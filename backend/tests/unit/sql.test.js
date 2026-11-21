const { escapeLike } = require('../../utils/sql');

test('escapeLike escapes %, _ and backslash, leaves other text alone', () => {
  expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
  expect(escapeLike('Ward A')).toBe('Ward A');
});
