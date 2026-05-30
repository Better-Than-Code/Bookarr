export const sanitizationMap = [
  [/\bMr\./gi, "Mister"],
  [/\bMrs\./gi, "Missus"],
  [/\bMs\./gi, "Miss"],
  [/\bDr\./gi, "Doctor"],
  [/\bProf\./gi, "Professor"],
  [/\bSt\./gi, "Saint"],
  [/\be\.g\./gi, "for example"],
  [/\bi\.e\./gi, "that is"],
  [/\bvs\./gi, "versus"],
  [/\bco\./gi, "company"],
  [/\betc\./gi, "etcetera"],
  [/\bhwy\./gi, "highway"],
  [/\bRd\./gi, "Road"],
  [/\bSt\.\b/gi, "Street"],
  [/\bAve\./gi, "Avenue"],
  [/\bJan\./gi, "January"],
  [/\bFeb\./gi, "February"],
  [/\bMar\./gi, "March"],
  [/\bApr\./gi, "April"],
  [/\bJun\./gi, "June"],
  [/\bJul\./gi, "July"],
  [/\bAug\./gi, "August"],
  [/\bSep\./gi, "September"],
  [/\bOct\./gi, "October"],
  [/\bNov\./gi, "November"],
  [/\bDec\./gi, "December"],
];

export const sanitizeText = (text: string): string => {
  let sanitized = text;
  sanitizationMap.forEach(([pattern, replacement]) => {
    sanitized = sanitized.replace(pattern as RegExp, replacement as string);
  });
  return sanitized;
};

// Add more TTS utility functions here
