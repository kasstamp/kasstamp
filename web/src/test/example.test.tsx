import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Simple example test
describe('Example Test Suite', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true);
  });

  it('should perform math correctly', () => {
    expect(2 + 2).toBe(4);
  });

  // Example React component test
  it('should render a basic component', () => {
    const TestComponent = () => <div>Hello Test</div>;

    render(
      <BrowserRouter>
        <TestComponent />
      </BrowserRouter>,
    );

    expect(screen.getByText('Hello Test')).toBeInTheDocument();
  });
});
