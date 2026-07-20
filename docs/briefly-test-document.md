# Customer onboarding pilot review

The product team ran a six-week onboarding pilot with 240 participants. Eighty-two percent of participants completed the main setup workflow, compared with sixty-four percent before the pilot. Most participants understood the first two setup steps, but many paused when the application began importing their data.

Researchers linked the interruption to weak progress feedback. Participants could not tell whether the import was still running, and twelve percent restarted the process at least once. Restarting created duplicate support requests and increased the median setup time from seven minutes to eleven minutes.

The team approved three changes for the next release. Engineering will add named processing stages, show an estimated completion range, and preserve completed work after a failed import. Support will replace the generic failure message with recovery instructions that identify the failed stage.

The product manager will measure completion rate, duplicate retry rate, median setup time, and support contacts per one hundred sessions. The team set a completion-rate target of eighty-eight percent and a duplicate retry-rate target below four percent.

The pilot did not test mobile devices or accounts containing more than fifty thousand records. The team will run a separate mobile study before making claims about mobile completion. Engineering also needs a load test before it can confirm performance for large accounts.
