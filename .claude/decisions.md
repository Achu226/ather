# Decisions

- 2026-11-09 Self-learning skills (Hermes-style): after a job with 3+ successful action steps that no skill covered, learnSkill() (services/skills.js) has the local model write a skill; it is saved only after the user says yes on a `skills_learn` approval card. The skill's tools regex is built from the tools the job really used, never from model text.
- 2026-11-09 Mouse-and-keyboard jobs already go to the 9B (brain.js onScreen); "open the X app" no longer matches the "Build me an app" skill (it fed the 9B coding steps).
- 2026-11-09 places_accessible uses OSM Nominatim (Overpass servers timed out from India); answers come from a built `summary` because the model invented a famous "step-free" hospital. Most Indian OSM places have no wheelchair tag → "unknown, call ahead".
- 2026-11-09 Accessibility skills pack: names use rare words (one name word alone picks a skill). Day maths is done in code: reminders_create takes in_days (9 am).
- 2026-11-09 Project lives in D:\ather 2.0 on the new PC (was E:\); git repo started here at 1.8.2 (commit 60bb89d).
