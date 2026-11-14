# Repository Agent Instructions

## Scope and Existing Work

- Make the smallest change that fully satisfies the request.
- Follow nearby project patterns and existing APIs before introducing new abstractions.
- Preserve unrelated working-tree changes. Do not revert, clean up, or reformat files outside the requested scope.
- Do not broaden a file-specific request into a repository-wide refactor unless explicitly asked.
- When searching or traversing the codebase, exclude the `node_modules` directory by default to avoid command timeouts and excessive disk I/O. Only search inside `node_modules` if you are explicitly looking for third-party dependency implementations or if the target cannot be found anywhere else in the project.

## Code Style

- Prefer self-explanatory code and avoid comments that merely restate what the code already makes clear.
- Keep text files UTF-8 encoded and preserve the existing line-ending style of files being edited.
- FQCN is strictly prohibited, use import if possible.
- Each line of code must be no longer than 135 characters.
- Do not compress multiple statements or structures onto one line; keep the code clear and readable.
- Spaces and indentation must follow the conventions of the relevant programming language and support readability.
- A single line must not contain multiple code blocks or multiple HTML tags.
- Organize code into modules by function and keep responsibilities clearly separated.


## Commit conventions:

- Write commit messages in the Conventional Commits style (`feat:`, `fix:`, `docs:`, `refactor:`, ...) and never add emoji.
