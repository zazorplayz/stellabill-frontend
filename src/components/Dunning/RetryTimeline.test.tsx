import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RetryTimeline from './RetryTimeline';

const NOW = '2026-03-22T10:00:00Z';

afterEach(() => {
  vi.useRealTimers();
});

describe('RetryTimeline', () => {
  it('preserves the legacy attempt shape and identifies the next retry', () => {
    render(<RetryTimeline attempts={[
      { id: 'past', when: 'Mar 20', status: 'past' },
      { id: 'next', when: 'Mar 22', status: 'upcoming' },
      { id: 'later', when: 'Mar 24', status: 'upcoming' },
    ]} />);

    const items = within(screen.getByRole('list', { name: 'Retry schedule' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Mar 20');
    expect(items[0]).toHaveTextContent('Attempted');
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    expect(items[2]).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('status')).toHaveTextContent('Next payment retry scheduled for Mar 22.');
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('uses the legacy date label as the timestamp when scheduledAt is absent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    render(<RetryTimeline attempts={[
      { id: 'next', when: '2026-03-22T14:00:00Z', status: 'upcoming' },
    ]} />);

    expect(screen.getByText('2026-03-22T14:00:00Z').closest('time'))
      .toHaveAttribute('dateTime', '2026-03-22T14:00:00Z');
    expect(screen.getByText('+4 h')).toBeInTheDocument();
  });

  it('prefers an explicit timestamp and forwards optional method and probability', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    render(<RetryTimeline attempts={[
      {
        id: 'next', when: 'Tomorrow morning', scheduledAt: '2026-03-23T10:00:00Z',
        status: 'upcoming', method: 'usdc', successProbability: 0.75,
      },
    ]} />);

    expect(screen.getByText('Tomorrow morning').closest('time'))
      .toHaveAttribute('dateTime', '2026-03-23T10:00:00Z');
    expect(screen.getByText('+1 d')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Success probability: 75%' }))
      .toHaveAttribute('aria-valuenow', '75');
  });

  it('shows a deterministic empty state for an empty schedule', () => {
    render(<RetryTimeline attempts={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent('No retry schedule is available.');
    expect(screen.getByRole('alert')).toHaveTextContent('All retries exhausted');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the exhausted state when every attempt has failed', () => {
    render(<RetryTimeline attempts={[
      { id: 'a', when: 'Mar 20', status: 'failed' },
      { id: 'b', when: 'Mar 21', status: 'failed' },
    ]} />);

    expect(screen.getByRole('status')).toHaveTextContent('All retry attempts have failed.');
    expect(screen.getByRole('alert')).toHaveTextContent('Update your payment method');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('clamps an invalid zero maxVisible to one and expands and collapses', () => {
    render(<RetryTimeline maxVisible={0} attempts={[
      { id: 'a', when: 'Mar 22', status: 'upcoming' },
      { id: 'b', when: 'Mar 23', status: 'upcoming' },
      { id: 'c', when: 'Mar 24', status: 'upcoming' },
    ]} />);

    const list = screen.getByRole('list', { name: 'Retry schedule' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    const expand = screen.getByRole('button', { name: /Show all attempts/ });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const collapse = screen.getByRole('button', { name: 'Show less' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('updates from an upcoming retry to failure and then to success', () => {
    const upcoming = { id: 'attempt', when: 'Mar 22', status: 'upcoming' as const };
    const { rerender } = render(<RetryTimeline attempts={[upcoming]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Next payment retry scheduled');

    rerender(<RetryTimeline attempts={[{ ...upcoming, status: 'failed' }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('All retries exhausted');

    rerender(<RetryTimeline attempts={[{ ...upcoming, status: 'succeeded' }]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Succeeded');
  });

  it('forwards custom scheduling help and closes its popover', () => {
    render(<RetryTimeline attempts={[
      { id: 'a', when: 'Mar 22', status: 'upcoming' },
    ]} whyContent={<p>Retry after the bank window.</p>} />);

    const trigger = screen.getByRole('button', { name: 'How we schedule retries' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveTextContent('Retry after the bank window.');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
