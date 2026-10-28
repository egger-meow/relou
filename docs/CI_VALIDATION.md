# Relou MVP CI validation

This temporary PR checks the entire MVP source tree through GitHub Actions on a pull request. It contains no production secrets or participant data.

Run: npm install, npm run typecheck, npm test, npm run build.

Final verification includes D1 bulk matching, retention purge and admin suppression changes on main.
