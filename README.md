# Sierrendipity

A web-based coding tutor for a high-school student preparing for coding Olympiad competitions.

- Languages: Python, C, C++
- Browser IDE with small multi-file projects, usable from anywhere
- Lessons are added one at a time by the tutor, the student, and Claude
- Code runs on AWS: Python is executed, C/C++ is compiled and then executed

Status: architecture exploration (execution backend not yet chosen).

## Development

```
npm install
npm test      # Gherkin specs (Cucumber.js)
```

Work is tracked in Kanbus (`kbs`); see `AGENTS.md` and `CONTRIBUTING_AGENT.md`.
