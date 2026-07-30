// Shared status vocab for the Projects module (Project / Jobs / Quote=Bids).
// Kept centralized (unlike the per-page safeStr/safeNum convention) because
// these three components all need the exact same status options and colors.

export const PROJECT_STATUSES = ['Idea', 'Gather Quotes', 'In Progress', 'Done', 'Cancelled']
export const JOB_STATUSES = ['Needs Bids', 'Bidding', 'Bid Selected', 'Scheduled', 'In Progress', 'Completed', 'Cancelled']
export const BID_STATUSES = ['Pending Quote Schedule', 'Quote Schedule Confirmed', 'Review Quote', 'Quote/Project Awarded', 'Dispositioned']

export const PROJECT_STATUS_STYLE = {
  'idea':          'bg-gray-100 text-gray-600',
  'gather quotes': 'bg-amber-100 text-amber-700',
  'in progress':   'bg-blue-100 text-blue-700',
  'done':          'bg-green-100 text-green-700',
  'cancelled':     'bg-gray-100 text-gray-400',
}
export const PROJECT_STATUS_ORDER = ['in progress', 'gather quotes', 'idea', 'done', 'cancelled']

export const JOB_STATUS_STYLE = {
  'needs bids':   'bg-amber-100 text-amber-700',
  'bidding':      'bg-orange-100 text-orange-700',
  'bid selected': 'bg-blue-100 text-blue-700',
  'scheduled':    'bg-cyan-100 text-cyan-700',
  'in progress':  'bg-purple-100 text-purple-700',
  'completed':    'bg-green-100 text-green-700',
  'cancelled':    'bg-gray-100 text-gray-400',
}
