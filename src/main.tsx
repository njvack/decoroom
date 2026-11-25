import { render } from 'preact';
import { App } from './app/App';
import { installGlobalSync, openFromHash } from './app/store';
import './app/styles.css';

installGlobalSync();
void openFromHash(location.hash).finally(() => {
  render(<App />, document.getElementById('app')!);
});
