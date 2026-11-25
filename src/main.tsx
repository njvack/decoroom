import { render } from 'preact';
import { App } from './app/App';
import { installGlobalSync, openFromHash } from './app/store';
import './app/styles.css';

// The static agent instructions are for text-only fetchers; people don't need them.
document.getElementById('agent-docs')?.setAttribute('hidden', '');

installGlobalSync();
void openFromHash(location.hash).finally(() => {
  render(<App />, document.getElementById('app')!);
});
