// Escapes LIKE wildcards (and the escape char) so user text matches literally.
const escapeLike = (q) => String(q).replace(/[\\%_]/g, '\\$&');

module.exports = { escapeLike };
