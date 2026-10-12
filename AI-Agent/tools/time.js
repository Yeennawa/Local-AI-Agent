export const timeTool = {
  name: 'get_current_time',
  description: 'Current date and time.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA name like "Asia/Bangkok". Optional.'
      }
    },
    required: []
  },
  dangerous: false,
  async execute(params = {}) {
    const now = new Date();
    const timeZone = params?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';

    const timeFormatter = new Intl.DateTimeFormat('th-TH', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const dateFormatter = new Intl.DateTimeFormat('th-TH', {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    return {
      formattedTime: timeFormatter.format(now),
      formattedDate: dateFormatter.format(now),
      timezone: timeZone,
      iso: now.toISOString()
    };
  }
};
