// An empty state that only says "nothing here" is half a feature — each of
// these tells the reader what to do next.
const EmptyState = ({ title, description, action }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <h3 className="text-base sm:text-lg">{title}</h3>
    {description && (
      <p className="max-w-sm text-sm text-muted">{description}</p>
    )}
    {action}
  </div>
);

export default EmptyState;
