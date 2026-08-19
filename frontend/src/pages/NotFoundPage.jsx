import { Link } from 'react-router-dom';
import Logo from '../components/ui/Logo.jsx';

const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
    <Logo className="h-12 w-12" />
    <h1 className="text-2xl sm:text-3xl">This page does not exist</h1>
    <p className="max-w-sm text-muted">
      The link may be out of date, or the post or account behind it may have been removed.
    </p>
    <Link to="/" className="btn-primary px-6 py-3">
      Back home
    </Link>
  </div>
);

export default NotFoundPage;
