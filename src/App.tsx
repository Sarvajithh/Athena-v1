import { AppShell } from './components/shell/AppShell';
import './theme/tokens.css';
import './theme/typography.css';

console.log("App rendered");

export default function App() {
  console.log("Returning AppShell");

  return <AppShell />;
}