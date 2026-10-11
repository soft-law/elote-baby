import { BRAND } from "./config";

// Every visible string on the page, in English and Spanish.
// Both languages must have exactly the same keys (tests/i18n.test.ts checks this
// and scans every value for words this page must never use).

export type Lang = "en" | "es";

// A short block: a few-word title and one line under it.
export type Card = { title: string; body: string };

export type Copy = {
  meta: { lang: string; skip: string };
  nav: {
    label: string;
    pool: string;
    entrepreneurs: string;
    flow: string;
    menu: string;
    close: string;
    language: string;
    languageName: string;
    home: string;
  };
  hero: {
    titleA: string;
    titleB: string;
    sub: string;
    invest: string;
    borrow: string;
  };
  pool: {
    title: string;
    body: string;
    cardLabel: string;
    line: string;
    entrepreneur: string;
    entrepreneurValue: string;
    principal: string;
    interest: string;
    interestValue: string;
    term: string;
    termValue: string;
    drawn: string;
    repaid: string;
    status: string;
    statusValue: string;
    caption: string;
  };
  investors: { title: string; cards: [Card, Card, Card] };
  entrepreneurs: { title: string; cards: [Card, Card, Card] };
  flow: {
    title: string;
    nodes: [string, string, string, string, string];
    tags: [string, string, string, string, string];
    writeOff: string;
  };
  agreement: {
    title: string;
    steps: [Card, Card, Card];
  };
  honesty: {
    title: string;
    onLabel: string;
    on: [string, string, string];
    offLabel: string;
    off: [string, string];
  };
  lines: {
    title: string;
    govTitle: string;
    govBody: string;
    chip: string;
    smeTitle: string;
    smeBody: string;
  };
  where: {
    title: string;
    body: string;
    nextLabel: string;
    chips: [string, string, string, string];
  };
  footer: {
    powered: string;
    disclaimer: string;
    legal: string;
    terms: string;
    privacy: string;
  };
};

export const translations: Record<Lang, Copy> = {
  en: {
    meta: { lang: "en", skip: "Skip to content" },
    nav: {
      label: "Main",
      pool: "Pool",
      entrepreneurs: "Entrepreneurs",
      flow: "How it works",
      menu: "Menu",
      close: "Close",
      language: "Language",
      languageName: "English",
      home: `${BRAND}, home`,
    },
    hero: {
      titleA: "Mexican loans",
      titleB: "on Solana.",
      sub: "Your deposit funds credit lines for small businesses, like the panadería on your corner, some with government support.",
      invest: "Invest",
      borrow: "Borrow",
    },
    pool: {
      title: "One pool, many credit lines",
      body: "Every deposit joins one pool. Each credit line is opened from it and repaid into it.",
      cardLabel: "Example",
      line: "Line #12",
      entrepreneur: "Entrepreneur",
      entrepreneurValue: "panadería (illustrative)",
      principal: "Principal",
      interest: "Fixed interest",
      interestValue: "12% of principal",
      term: "Term",
      termValue: "180 days",
      drawn: "Drawn",
      repaid: "Repaid",
      status: "Status",
      statusValue: "Active",
      caption: "Interest is fixed when the line opens and counts only when repaid.",
    },
    investors: {
      title: "If you invest",
      cards: [
        { title: "You get shares", body: "Deposit and hold a share token." },
        { title: "Your share grows", body: "Worth more when a loan is repaid with interest." },
        { title: "Redeem your shares", body: "Redeem when the pool has enough on hand." },
      ],
    },
    entrepreneurs: {
      title: "If you borrow",
      cards: [
        { title: "Sign your line", body: "It opens when you and the pool both sign." },
        { title: "Get the money", body: "Draw the loan to your wallet." },
        { title: "Repay your way", body: "Pay it back, or let anyone pay for you." },
      ],
    },
    flow: {
      title: "How the money moves",
      nodes: ["Your deposit", "The pool", "Panadería line", "Repayment", "Your shares"],
      tags: ["share token", "one vault", "fixed interest", "anyone can pay", "worth more"],
      writeOff: "A written-off loan makes every share worth less.",
    },
    agreement: {
      title: "The agreement",
      steps: [
        { title: "Draft", body: "An agent drafts it from a pilot template under legal review." },
        { title: "Sign", body: "You and the pool sign; the agent holds no keys." },
        { title: "Open", body: "Your line stores its hash on Solana." },
      ],
    },
    honesty: {
      title: "What the chain sees",
      onLabel: "On chain",
      on: ["Deposits, shares, redemptions.", "Lines, repayments, write-offs.", "The hash of each signed agreement."],
      offLabel: "Not on chain",
      off: ["Identity and credit checks.", "The signed original."],
    },
    lines: {
      title: "Two kinds of lines",
      govTitle: "Government-supported",
      govBody: "A public program may sign with you and pay part of the interest.",
      chip: "Subsidized",
      smeTitle: "People and small businesses",
      smeBody: "Funded by the pool and repaid from your wallet.",
    },
    where: {
      title: "Where we are",
      body: "Early talks with a municipal program in Baja California; nothing signed.",
      nextLabel: "Next steps",
      chips: ["Regulated lender", "Treasury in Mexican bills", "Operator credentials", "Human arbitrator for disputes"],
    },
    footer: {
      powered: "Powered by Soft.Law. Softlaw S.A. de C.V.",
      disclaimer: "Devnet demo with test assets. Not an offer of securities.",
      legal: "Legal",
      terms: "Terms",
      privacy: "Privacy",
    },
  },
  es: {
    meta: { lang: "es", skip: "Ir al contenido" },
    nav: {
      label: "Principal",
      pool: "Pool",
      entrepreneurs: "Emprendedores",
      flow: "Cómo funciona",
      menu: "Menú",
      close: "Cerrar",
      language: "Idioma",
      languageName: "Español",
      home: `${BRAND}, inicio`,
    },
    hero: {
      titleA: "Préstamos mexicanos",
      titleB: "en Solana.",
      sub: "Tu depósito fondea líneas de crédito para negocios pequeños, como la panadería de tu esquina, algunas con apoyo de gobierno.",
      invest: "Invertir",
      borrow: "Pedir crédito",
    },
    pool: {
      title: "Un pool, muchas líneas de crédito",
      body: "Cada depósito entra a un solo pool. Cada línea de crédito se abre desde ahí y se paga de vuelta ahí.",
      cardLabel: "Ejemplo",
      line: "Línea #12",
      entrepreneur: "Emprendedor",
      entrepreneurValue: "panadería (ilustrativo)",
      principal: "Principal",
      interest: "Interés fijo",
      interestValue: "12% del principal",
      term: "Plazo",
      termValue: "180 días",
      drawn: "Dispuesto",
      repaid: "Pagado",
      status: "Estado",
      statusValue: "Activa",
      caption: "El interés se fija al abrir la línea y solo cuenta cuando se paga.",
    },
    investors: {
      title: "Si inviertes",
      cards: [
        { title: "Recibes participaciones", body: "Deposita y recibe un token de participación." },
        { title: "Tu parte crece", body: "Vale más cuando un préstamo se paga con interés." },
        { title: "Canjea después", body: "Canjea cuando el pool tenga fondos disponibles." },
      ],
    },
    entrepreneurs: {
      title: "Si pides crédito",
      cards: [
        { title: "Firma tu línea", body: "Se abre cuando tú y el pool firman." },
        { title: "Recibe el dinero", body: "Pasa el préstamo a tu wallet." },
        { title: "Paga a tu manera", body: "Págalo tú, o deja que cualquiera pague por ti." },
      ],
    },
    flow: {
      title: "Cómo se mueve el dinero",
      nodes: ["Tu depósito", "El pool", "Línea de la panadería", "El pago", "Tus participaciones"],
      tags: ["token de participación", "una bóveda", "interés fijo", "cualquiera puede pagar", "valen más"],
      writeOff: "Un préstamo perdido hace que cada participación valga menos.",
    },
    agreement: {
      title: "El contrato",
      steps: [
        { title: "Redactar", body: "Un agente lo redacta con una plantilla piloto en revisión legal." },
        { title: "Firmar", body: "Tú y el pool firman; el agente no guarda llaves." },
        { title: "Abrir", body: "Tu línea guarda su hash en Solana." },
      ],
    },
    honesty: {
      title: "Lo que ve la cadena",
      onLabel: "On chain",
      on: ["Depósitos, participaciones, canjes.", "Líneas, pagos, préstamos perdidos.", "El hash de cada contrato firmado."],
      offLabel: "Fuera de la cadena",
      off: ["Verificación de identidad y de crédito.", "El contrato original firmado."],
    },
    lines: {
      title: "Dos tipos de líneas",
      govTitle: "Con apoyo de gobierno",
      govBody: "Un programa público puede firmar contigo y pagar parte del interés.",
      chip: "Subsidiada",
      smeTitle: "Personas y negocios pequeños",
      smeBody: "Con fondos del pool y pagada desde tu wallet.",
    },
    where: {
      title: "Dónde estamos",
      body: "Pláticas iniciales con un programa municipal en Baja California; nada firmado.",
      nextLabel: "Siguientes pasos",
      chips: ["Entidad de crédito regulada", "Tesorería en Cetes", "Credenciales de operador", "Árbitro humano para disputas"],
    },
    footer: {
      powered: "Con tecnología de Soft.Law. Softlaw S.A. de C.V.",
      disclaimer: "Demo en devnet con activos de prueba. No es una oferta de valores.",
      legal: "Legal",
      terms: "Términos",
      privacy: "Privacidad",
    },
  },
};
