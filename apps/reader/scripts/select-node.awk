# Bootstrap without requiring an existing Node or Python installation.
# Node's official index contains flat release objects; whitespace and object
# order are deliberately ignored. Never accept an alpha/beta/RC version.
BEGIN { RS = "}"; bestMajor = 0; bestMinor = 0; bestPatch = 0 }
{
  row = $0
  if (!match(row, /"version"[[:space:]]*:[[:space:]]*"v[0-9]+\.[0-9]+\.[0-9]+"/)) next
  version = substr(row, RSTART, RLENGTH)
  sub(/^.*"v/, "", version); sub(/"$/, "", version)
  if (channel == "current") {
    if (row !~ /"lts"[[:space:]]*:[[:space:]]*false([[:space:],]|$)/) next
  } else if (row !~ /"lts"[[:space:]]*:[[:space:]]*"[^"]+"/) next
  split(version, number, ".")
  major = number[1] + 0; minor = number[2] + 0; patch = number[3] + 0
  if (major < 24) next
  if (major > bestMajor || (major == bestMajor && minor > bestMinor) || (major == bestMajor && minor == bestMinor && patch > bestPatch)) {
    bestMajor = major; bestMinor = minor; bestPatch = patch; best = "v" version
  }
}
END { if (best == "") exit 1; print best }
