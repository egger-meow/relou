# Relou MVP CI validation

This temporary PR checks the entire MVP source tree through GitHub Actions on a pull request. It contains no production secrets or participant data.

Run: npm install, npm run typecheck, npm test, npm run build.

Final verification includes D1 bulk matching, retention purge and admin suppression changes on main.

Additional verification includes migration 0002, manual retention controls, chunked D1 inserts and StrictMode Turnstile handling.

Final post-review run includes draft edit, round snapshot recovery and admin Host isolation.
