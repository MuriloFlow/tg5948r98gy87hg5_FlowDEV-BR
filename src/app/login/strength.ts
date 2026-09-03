export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  issues: string[];
  ok: boolean;
}

/** Versão client-side do avaliador de senha (o servidor revalida no submit). */
export function checkPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];
  if (password.length < 10) issues.push("Use pelo menos 10 caracteres");
  if (!/[a-z]/.test(password)) issues.push("Inclua uma letra minúscula");
  if (!/[A-Z]/.test(password)) issues.push("Inclua uma letra maiúscula");
  if (!/\d/.test(password)) issues.push("Inclua um número");

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++;

  return {
    score: Math.min(score, 4) as PasswordStrength["score"],
    issues,
    ok: issues.length === 0,
  };
}
