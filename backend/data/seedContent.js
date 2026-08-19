// Seed content for a believable network.
//
// A social app with three posts demos as broken no matter how good the code
// is, so this file is treated as a feature rather than a chore: plausible
// handles from a genuinely global cast, and posts that reply to each other so
// the thread views have something to show.
//
// The cast spans six continents on purpose — Jamii is a name borrowed from
// Swahili (it means "community"), not a product scoped to one country, and an
// all-one-nationality seed would misrepresent that to the first person who
// opens it.

export const people = [
  { handle: 'wanjiku', displayName: 'Elena Fischer', bio: 'Frontend dev. Tailwind apologist. Cold brew over everything.', location: 'Berlin, Germany' },
  { handle: 'otieno', displayName: 'Marcus Ortiz', bio: 'Backend engineer. Postgres, Go, and long-distance running.', location: 'Austin, USA' },
  { handle: 'amina', displayName: 'Amina Hassan', bio: 'Product designer. I draw boxes and argue about spacing.', location: 'Dubai, UAE' },
  { handle: 'kipchoge_dev', displayName: 'Elias Novak', bio: 'Mobile dev. Flutter by day, Kotlin by night.', location: 'Prague, Czechia' },
  { handle: 'njeri', displayName: 'Mei Lin', bio: 'Data engineer. Pipelines that do not wake me at 3am.', location: 'Singapore' },
  { handle: 'sam_dev', displayName: 'Samuel Ade', bio: 'Building tools for small businesses. Ex-teacher.', location: 'Lagos, Nigeria' },
  { handle: 'zawadi', displayName: 'Zawadi Achieng', bio: 'Security research. I read your error messages for fun.', location: 'Nairobi, Kenya' },
  { handle: 'mutiso', displayName: 'Diego Fernandez', bio: 'DevOps. Terraform whisperer. Coffee-powered.', location: 'Mexico City, Mexico' },
  { handle: 'halima', displayName: 'Halima Yusuf', bio: 'Technical writer. Docs are a product feature.', location: 'Istanbul, Turkey' },
  { handle: 'kimani', displayName: 'Marco Rossi', bio: 'Freelance fullstack. Available for interesting work.', location: 'Milan, Italy' },
  { handle: 'grace_ui', displayName: 'Grace Okafor', bio: 'UI engineer. Accessibility is not optional.', location: 'Toronto, Canada' },
  { handle: 'dennis', displayName: 'Dennis Park', bio: 'Game dev experiments. Godot enjoyer.', location: 'Seoul, South Korea' },
  { handle: 'faith_ml', displayName: 'Priya Sharma', bio: 'ML engineer. Mostly cleaning data, occasionally training models.', location: 'Bangalore, India' },
  { handle: 'brian_k', displayName: 'Bruno Karlsson', bio: 'Startup ops. Spreadsheets are a legitimate database.', location: 'Stockholm, Sweden' },
  { handle: 'sarah_dev', displayName: 'Sarah Ng', bio: 'React Native. Shipping is a habit, not an event.', location: 'Manila, Philippines' },
  { handle: 'omondi', displayName: 'Victor Andrade', bio: 'Backend + payments. Stripe and PayPal integrations survivor.', location: 'São Paulo, Brazil' },
  { handle: 'lucy_qa', displayName: 'Lucy Chen', bio: 'QA lead. I find the bug you swore was impossible.', location: 'Melbourne, Australia' },
  { handle: 'tech_mama', displayName: 'Esther Adeyemi', bio: 'Engineering manager. Mentoring juniors is the best part.', location: 'Accra, Ghana' },
  { handle: 'kevo', displayName: "Kevin O'Malley", bio: 'Student dev. Learning in public, mistakes included.', location: 'Dublin, Ireland' },
  { handle: 'anita', displayName: 'Anita Kowalski', bio: 'Cloud architect. Yes, it is a DNS problem.', location: 'Amsterdam, Netherlands' },
];

// Posts reference authors by handle. `replies` become real threaded replies so
// the permalink view has genuine conversation in it rather than a lone post.
export const posts = [
  {
    handle: 'wanjiku',
    text: 'Spent the morning replacing a 400-line CSS file with about 40 lines of Tailwind. The diff is the most satisfying thing I have seen all week. #webdev',
    replies: [
      { handle: 'grace_ui', text: 'The moment it clicks is genuinely a bit addictive. Did you keep any custom classes?' },
      { handle: 'wanjiku', text: 'Only three, all for animations that were easier to read as real CSS.' },
    ],
  },
  {
    handle: 'otieno',
    text: 'Reminder that an index is not free. Added five to a table this week and watched writes get 30% slower. Measured before, measured after. #postgres',
    replies: [{ handle: 'njeri', text: 'This is the lesson nobody teaches until it costs you a weekend.' }],
  },
  {
    handle: 'amina',
    text: 'Design tip nobody asked for: if your empty state just says "No items", you have shipped half a feature. Tell people what to do next. #design',
    replies: [
      { handle: 'halima', text: 'And write it in words a person would say out loud. "No records found" is not that.' },
      { handle: 'amina', text: 'Exactly. Copy is design work.' },
    ],
  },
  { handle: 'zawadi', text: 'Found an API today that returns 200 with an error message in the body. Please stop doing this. HTTP already has status codes. #webdev' },
  {
    handle: 'kipchoge_dev',
    text: 'Two hours debugging a layout issue on Android that turned out to be a keyboard inset. Mobile development is 30% code and 70% platform trivia. #mobile',
    replies: [{ handle: 'sarah_dev', text: 'The trivia IS the job. Nobody warns you.' }],
  },
  { handle: 'njeri', text: 'Rewrote a pipeline that ran for 40 minutes so it now runs in 4. The trick was doing less work, not doing work faster. #dataengineering #devops' },
  {
    handle: 'mutiso',
    text: 'If your deploy needs a person to be awake for it, it is not automated, it is scheduled. #devops',
    replies: [{ handle: 'anita', text: 'Putting this on a poster above my desk.' }],
  },
  { handle: 'faith_ml', text: 'Honest breakdown of my week: 6 hours cleaning data, 45 minutes training a model, 3 hours explaining why the model is not magic. #machinelearning' },
  {
    handle: 'sam_dev',
    text: 'Shipped an invoicing tool for a local shop today. Watching the owner use it and immediately find a thing I got wrong is worth more than any test suite. #buildinpublic',
    replies: [
      { handle: 'tech_mama', text: 'Real users in the first week. That is the whole game.' },
      { handle: 'kimani', text: 'What did they find?' },
      { handle: 'sam_dev', text: 'Dates. Always dates. They enter them the other way round and I never considered it.' },
    ],
  },
  { handle: 'halima', text: 'Wrote docs for a feature before building it. Found three design problems before writing a line of code. Recommend. #writing #design' },
  {
    handle: 'grace_ui',
    text: 'Tested our app with a keyboard only, no mouse, for one hour. Could not complete checkout. Fixed it today. Try this on your own product. #a11y #design',
    replies: [{ handle: 'lucy_qa', text: 'Adding this to our release checklist right now.' }],
  },
  { handle: 'kimani', text: 'Freelance lesson learned the expensive way: a deposit is not rude, it is the contract working correctly. #buildinpublic' },
  {
    handle: 'omondi',
    text: 'Payment webhook notes for anyone starting: the callback can arrive before your own database write finishes. Handle it. Ask me how I know. #webhooks',
    replies: [
      { handle: 'otieno', text: 'The race nobody documents. Did you end up queueing them?' },
      { handle: 'omondi', text: 'Idempotency key on the checkout id, and the callback upserts. Boring and it works.' },
    ],
  },
  { handle: 'dennis', text: 'Made a tiny game where you sort mangoes by ripeness. It is 200 lines and my nephew has played it for an hour. Scope is a feature. #gamedev #buildinpublic' },
  { handle: 'lucy_qa', text: 'The bug report that starts "it does not work" costs an hour. The one with steps costs five minutes. Write the steps. #testing' },
  {
    handle: 'tech_mama',
    text: 'A junior asked me today why we do code review if we have tests. Best question I have been asked in months — review is about the code we are going to write next, not just this one. #testing',
    replies: [{ handle: 'kevo', text: 'Saving this. I have been treating review as a gate rather than a conversation.' }],
  },
  { handle: 'kevo', text: 'Week 6 of learning backend. Finally understand what a middleware actually is. It is just a function that gets to go first. Why did nobody say that. #learning #webdev' },
  { handle: 'brian_k', text: 'We replaced a project management tool with a shared spreadsheet and a Friday call. Velocity went up. Not every problem is a software problem. #buildinpublic' },
  {
    handle: 'anita',
    text: 'Cloud bill dropped 60% this month. Cause: one forgotten test cluster that had been running since March. Check your regions, all of them. #cloud #devops',
    replies: [{ handle: 'mutiso', text: 'The forgotten region is a rite of passage.' }],
  },
  { handle: 'sarah_dev', text: 'Shipped a build today with a feature flag off. It has been in production for a week and nobody knew. This is the calmest release process I have ever had. #devops' },
  { handle: 'wanjiku', text: 'Unpopular opinion: most dashboards would be better as a weekly email. #design' },
  { handle: 'zawadi', text: 'Reading a codebase where every function is called handleData. I am fluent in nothing. Name things. #webdev' },
  { handle: 'faith_ml', text: 'Reminder: a model that is 95% accurate on a problem where 95% of cases are one class has learned absolutely nothing. #machinelearning' },
  { handle: 'dennis', text: 'Godot 4 particle systems are genuinely fun to play with. Lost an evening making sparks. No regrets. #gamedev' },
  { handle: 'njeri', text: 'Naming a column `data` is a promise to your future self that you will suffer. #dataengineering' },
];

export const demoAccounts = [
  {
    handle: 'demo',
    displayName: 'Demo User',
    email: 'demo@jamii.app',
    password: 'demo12345',
    bio: 'Signed in as the demo account — follow a few people and the home feed fills up.',
    role: 'user',
  },
  {
    // Not 'admin' — that collides with the app's own /admin route. A real
    // user's own profile would be unreachable under that handle (the fixed
    // route always wins over :handle), and this seeded account hit exactly
    // that bug before it was renamed. See utils/reservedHandles.js.
    handle: 'jamii_admin',
    displayName: 'Jamii Admin',
    email: 'admin@jamii.app',
    password: 'admin12345',
    bio: 'Platform administrator.',
    role: 'admin',
  },
];
