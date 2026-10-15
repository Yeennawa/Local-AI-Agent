// GitHub Search Tool
// Queries the public GitHub REST API for open-source repositories and code projects.

const GITHUB_SEARCH_ENDPOINT = 'https://api.github.com/search/repositories';
const GITHUB_TIMEOUT_MS = 4500;
const USER_AGENT = 'LocalAIAgent/1.0 (https://github.com/Yeennawa/Local-AI-Agent; student-project@local.ai)';

export const githubTool = {
  name: 'search_github',
  description: 'Search GitHub for open-source repositories, libraries, and code projects.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Repository name, topic, or keyword to search on GitHub (e.g. "maxheadbox", "ollama")'
      }
    },
    required: ['query']
  },
  dangerous: false,
  async execute(params = {}) {
    const rawQuery = params?.query;
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return { error: 'Query parameter is required and cannot be empty' };
    }

    const query = rawQuery.trim();
    const url = `${GITHUB_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=3`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
      });

      if (!response.ok) {
        if (response.status === 403) {
          return { error: 'GitHub API rate limit exceeded. Please try again later.' };
        }
        return { error: `GitHub API responded with status ${response.status}` };
      }

      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      if (items.length === 0) {
        return {
          query,
          count: 0,
          repositories: [],
          message: `No GitHub repositories found matching "${query}"`
        };
      }

      const repositories = items.slice(0, 3).map((repo) => ({
        name: repo.full_name || repo.name,
        description: repo.description ? (repo.description.length > 120 ? `${repo.description.slice(0, 120)}...` : repo.description) : 'No description provided',
        stars: repo.stargazers_count || 0,
        url: repo.html_url
      }));

      return {
        query,
        count: repositories.length,
        repositories
      };
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return { error: 'GitHub search request timed out' };
      }
      return { error: `GitHub lookup failed: ${error.message || 'Offline or network error'}` };
    }
  }
};
