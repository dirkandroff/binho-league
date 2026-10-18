# League backend

Code.gs is the source for the existing bound Google Apps Script project. The website reads the public leaderboard and relays authenticated admin requests through its API. Admin sessions stay in script properties and the browser receives only an HttpOnly cookie.

The script property ADMIN_PASSWORD must contain the shared admin password, at least 12 characters. Set it directly in Google Apps Script Project Settings. Do not place it in the spreadsheet, this repository, or browser JavaScript.

Season 2 standings come from the Season 2 sheet. Match Reports stores every match and its prestige cycle. Prestige Log stores the record immediately before each reset. The current rule permits an admin to prestige at 51 current wins, resetting both current wins and losses. Total season wins and losses retain all confirmed results.

Season 1 Archive contains fixed final values and original player names. Season 1 losses were never tracked. The original Player Data and Sheet1 scorecard remain preserved for reference.

For routine use, report matches in the Admin tab, rather than editing calculated win and loss cells. An admin can add players, choose available avatars, or mark players inactive. Voiding a match preserves the report and records the correction. Matches from earlier prestige cycles require a history review before correction.
