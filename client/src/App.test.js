import { render, screen } from '@testing-library/react';
import App from './App';

test('renders content moderation dashboard', () => {
  render(<App />);
  // Check for loading state which appears first
  const loadingElement = screen.getByText(/Loading Dashboard/i);
  expect(loadingElement).toBeInTheDocument();
});
