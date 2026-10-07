import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS, CHECKLIST_HI } from './translations';

const STORAGE_KEY = 'h360_lang';
const HOUSEKEEPING_ROLES = ['HOUSEKEEPING_AGENT', 'HOUSEKEEPING'];

function format(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

function translate(lang, key, vars) {
  const text = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  return format(text, vars);
}

const LanguageContext = createContext({
  lang: 'en',
  canChoose: false,
  setLang: () => {},
  t: (key, vars) => translate('en', key, vars),
  itemText: (item) => ({ label: item?.label, description: item?.description })
});

export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const [stored, setStored] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'; } catch (e) { return 'en'; }
  });

  // Hindi is a housekeeping-staff option; every other role always sees English
  const canChoose = HOUSEKEEPING_ROLES.includes(user?.role);
  const lang = canChoose ? stored : 'en';

  const setLang = useCallback((next) => {
    const value = next === 'hi' ? 'hi' : 'en';
    setStored(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }, []);

  const value = useMemo(() => ({
    lang,
    canChoose,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    itemText: (item) => {
      const hi = lang === 'hi' ? CHECKLIST_HI[item?.label] : null;
      return { label: hi?.label || item?.label, description: hi?.description || item?.description };
    }
  }), [lang, canChoose, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
