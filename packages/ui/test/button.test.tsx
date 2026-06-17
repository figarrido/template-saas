import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Button } from '../src/components/button.js';

afterEach(() => cleanup());

describe('Button', () => {
  it('renders with default variant classes', () => {
    const { getByRole } = render(<Button>Click</Button>);
    const btn = getByRole('button');
    expect(btn.textContent).toBe('Click');
    expect(btn.className).toContain('bg-primary');
  });

  it('honors variant prop', () => {
    const { getByRole } = render(<Button variant="destructive">x</Button>);
    expect(getByRole('button').className).toContain('bg-destructive');
  });

  it('renders as child when asChild', () => {
    const { container } = render(
      <Button asChild>
        <a href="#x">link</a>
      </Button>,
    );
    expect(container.querySelector('a')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
