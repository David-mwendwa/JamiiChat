// Minimal class joiner. The app does not have conflicting-utility problems that
// would justify pulling in tailwind-merge.
const cn = (...values) => values.flat(Infinity).filter(Boolean).join(' ');

export default cn;
