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
  app: {
    meta: { title: string };
    nav: { label: string; home: string; pool: string; invest: string; borrow: string; backToSite: string };
    header: { network: string; connect: string };
    home: { title: string; sub: string; invest: Card; borrow: Card; poolLink: string; connectPrompt: string };
    pool: { title: string; sub: string };
    invest: { title: string; sub: string };
    borrow: { title: string; sub: string };
    placeholder: string;
    notFound: { title: string; body: string; home: string };
    error: { title: string; body: string; retry: string };
    config: { title: string; body: string; back: string };
    configDev: { body: string; missing: string; invalid: string };
    wallet: {
      choose: string;
      none: string;
      getWallet: string;
      connecting: string;
      connectFailed: string;
      connectedAs: string;
      menu: string;
      copy: string;
      copied: string;
      disconnect: string;
      close: string;
      wrongChain: string;
    };
    tx: {
      steps: { simulating: string; signing: string; sending: string; confirming: string; done: string };
      signingButton: string;
      viewExplorer: string;
      retry: string;
      dismiss: string;
      ops: { deposit: string; redeem: string; draw: string; repay: string };
      pending: {
        title: string;
        body: string;
        signed: string;
        sent: string;
        check: string;
        checking: string;
        unavailable: string;
      };
      errors: {
        rejected: string;
        expired: string;
        uncertain: string;
        insufficientSol: string;
        insufficientTokens: string;
        guard: string;
        busy: string;
        journal: string;
        network: string;
        noWallet: string;
        generic: string;
        programGeneric: string;
        program: {
          paused: string;
          unauthorized: string;
          wrongAmount: string;
          insufficientLiquidity: string;
          lineStatus: string;
          termNotEnded: string;
          overflow: string;
          sponsorRequired: string;
          zeroShares: string;
          firstDepositTooSmall: string;
          wrongAccount: string;
          slippageExceeded: string;
          termEnded: string;
          invalidSchedule: string;
          scheduleEndsAfterTerm: string;
          notScheduled: string;
          notEnoughMissed: string;
          lateInterestUnpaid: string;
          writeOffTooEarly: string;
        };
      };
    };
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
    app: {
      meta: { title: `App | ${BRAND}` },
      nav: { label: "App", home: "Start", pool: "Pool", invest: "Invest", borrow: "Borrow", backToSite: `Back to ${BRAND}` },
      header: { network: "Devnet", connect: "Connect wallet" },
      home: {
        title: "What would you like to do?",
        sub: "Choose a role. You can switch at any time.",
        invest: { title: "I invest", body: "Deposit tMXN, a test token, and receive pool shares." },
        borrow: { title: "I borrow", body: "Draw and repay a credit line opened for your wallet." },
        poolLink: "See the pool",
        connectPrompt: "Connect a wallet to start.",
      },
      pool: { title: "The pool", sub: "Value per share, liquidity and every credit line, read from Solana." },
      invest: {
        title: "Invest",
        sub: "Deposit tMXN test tokens for shares, or redeem shares when the pool has enough on hand.",
      },
      borrow: { title: "Borrow", sub: "Draw your approved line and repay it from your wallet." },
      placeholder: "This section is under construction.",
      notFound: { title: "Page not found", body: "This address does not match any page of the app.", home: "Go to the start" },
      error: { title: "Something went wrong", body: "This page could not load. Try again.", retry: "Try again" },
      config: {
        title: "The app is not available right now",
        body: "Please try again later.",
        back: `Back to ${BRAND}`,
      },
      configDev: {
        body: "These settings are missing or invalid. Set them in the environment and build again.",
        missing: "missing",
        invalid: "invalid",
      },
      wallet: {
        choose: "Choose a wallet",
        none: "No Solana wallet was found in this browser. Install one, such as Phantom, then reload this page.",
        getWallet: "Get Phantom",
        connecting: "Connecting…",
        connectFailed: "The wallet did not connect. Try again.",
        connectedAs: "Connected wallet",
        menu: "Wallet options",
        copy: "Copy address",
        copied: "Address copied",
        disconnect: "Disconnect",
        close: "Close",
        wrongChain:
          "This wallet account is not on the network this app uses, shown at the top of the page. Switch networks in your wallet and connect again.",
      },
      tx: {
        steps: {
          simulating: "Checking the transaction",
          signing: "Sign in your wallet",
          sending: "Sending",
          confirming: "Confirming",
          done: "Updated",
        },
        signingButton: "Signing…",
        viewExplorer: "View on Solana Explorer",
        retry: "Try again",
        dismiss: "Dismiss",
        ops: { deposit: "Deposit", redeem: "Redemption", draw: "Draw", repay: "Repayment" },
        pending: {
          title: "A transaction is still settling",
          body: "This browser signed a transaction whose result is not known yet. It is checked again every few seconds. You do not need to sign again.",
          signed: "Signed, not sent yet",
          sent: "Sent, waiting for confirmation",
          check: "Check now",
          checking: "Checking",
          unavailable:
            "Part of this browser's transaction record could not be read and was set aside. Before repeating a recent transaction, check your wallet's activity on Solana Explorer.",
        },
        errors: {
          rejected: "You declined the request in your wallet. Nothing was sent.",
          expired: "The transaction expired before it was confirmed. Nothing changed. Try again.",
          uncertain: "A transaction from this browser is still settling. Wait for its result before sending another one.",
          insufficientSol: "Not enough SOL to pay the network fee. Get test SOL and try again.",
          insufficientTokens: "Your wallet does not have enough tMXN test tokens for this.",
          guard: "The wallet returned a different transaction than the one prepared, so nothing was sent.",
          busy: "Another transaction is in progress in this browser. Wait for it to finish.",
          journal: "This browser could not save the transaction record, so nothing was sent. Allow site storage and try again.",
          network: "The Solana network could not be reached. Check your connection and try again.",
          noWallet: "Connect a wallet first.",
          generic: "The transaction could not be completed. Try again.",
          programGeneric: "The pool rejected this operation.",
          program: {
            paused: "The pool is paused. Deposits, redemptions and draws are on hold.",
            unauthorized: "This wallet is not allowed to do this.",
            wrongAmount: "The amount is zero or more than what is due.",
            insufficientLiquidity: "The pool does not have enough liquidity on hand for this right now.",
            lineStatus: "This credit line is not in a status that allows this.",
            termNotEnded: "The term of this line has not ended yet.",
            overflow: "The amount is too large.",
            sponsorRequired: "The sponsor named on this line must sign.",
            zeroShares: "This deposit is too small to receive any shares.",
            firstDepositTooSmall: "The first deposit in the pool must be at least 1 tMXN test token.",
            wrongAccount: "A token account does not match this pool.",
            slippageExceeded:
              "The pool value changed since you reviewed this, so you would receive less than the minimum shown. Review the new amounts and try again.",
            termEnded: "The term of this line has ended.",
            invalidSchedule: "The installment schedule of this line is not valid.",
            scheduleEndsAfterTerm: "The last installment would fall due after the end of the term.",
            notScheduled: "This line has no installment schedule.",
            notEnoughMissed: "This line has not missed enough installments to go to collection.",
            lateInterestUnpaid: "The payment must first cover the late interest due on this line. Pay at least that amount.",
            writeOffTooEarly: "This line cannot be written off yet. The grace period has not ended.",
          },
        },
      },
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
    app: {
      meta: { title: `App | ${BRAND}` },
      nav: { label: "App", home: "Inicio", pool: "Pool", invest: "Invertir", borrow: "Pedir crédito", backToSite: `Volver a ${BRAND}` },
      header: { network: "Devnet", connect: "Conectar wallet" },
      home: {
        title: "¿Qué quieres hacer?",
        sub: "Elige un rol. Puedes cambiarlo cuando quieras.",
        invest: { title: "Quiero invertir", body: "Deposita tMXN, un token de prueba, y recibe participaciones del pool." },
        borrow: { title: "Quiero pedir crédito", body: "Retira el crédito de una línea abierta para tu wallet y págalo." },
        poolLink: "Ver el pool",
        connectPrompt: "Conecta una wallet para empezar.",
      },
      pool: { title: "El pool", sub: "Valor por participación, liquidez y cada línea de crédito, leídos de Solana." },
      invest: {
        title: "Invertir",
        sub: "Deposita tokens de prueba tMXN a cambio de participaciones, o canjéalas cuando el pool tenga liquidez.",
      },
      borrow: { title: "Pedir crédito", sub: "Retira el crédito de tu línea aprobada y págalo desde tu wallet." },
      placeholder: "Esta sección está en construcción.",
      notFound: { title: "Página no encontrada", body: "Esta dirección no corresponde a ninguna página de la app.", home: "Ir al inicio" },
      error: { title: "Algo salió mal", body: "No se pudo cargar esta página. Inténtalo de nuevo.", retry: "Reintentar" },
      config: {
        title: "La app no está disponible por ahora",
        body: "Inténtalo más tarde.",
        back: `Volver a ${BRAND}`,
      },
      configDev: {
        body: "Faltan estos ajustes o no son válidos. Defínelos en el entorno y vuelve a compilar.",
        missing: "falta",
        invalid: "no válido",
      },
      wallet: {
        choose: "Elige una wallet",
        none: "No encontramos una wallet de Solana en este navegador. Instala una, como Phantom, y vuelve a cargar esta página.",
        getWallet: "Obtener Phantom",
        connecting: "Conectando…",
        connectFailed: "La wallet no se conectó. Inténtalo de nuevo.",
        connectedAs: "Wallet conectada",
        menu: "Opciones de la wallet",
        copy: "Copiar dirección",
        copied: "Dirección copiada",
        disconnect: "Desconectar",
        close: "Cerrar",
        wrongChain:
          "Esta cuenta de la wallet no está en la red que usa esta app, indicada arriba en la página. Cambia de red en tu wallet y vuelve a conectar.",
      },
      tx: {
        steps: {
          simulating: "Revisando la transacción",
          signing: "Firma en tu wallet",
          sending: "Enviando",
          confirming: "Confirmando",
          done: "Actualizado",
        },
        signingButton: "Firmando…",
        viewExplorer: "Ver en Solana Explorer",
        retry: "Reintentar",
        dismiss: "Cerrar",
        ops: { deposit: "Depósito", redeem: "Canje", draw: "Disposición", repay: "Pago" },
        pending: {
          title: "Una transacción sigue en curso",
          body: "Este navegador firmó una transacción cuyo resultado aún no se conoce. Se revisa de nuevo cada pocos segundos. No necesitas firmar otra vez.",
          signed: "Firmada, aún sin enviar",
          sent: "Enviada, esperando confirmación",
          check: "Revisar ahora",
          checking: "Revisando",
          unavailable:
            "Parte del registro de transacciones de este navegador no se pudo leer y se apartó. Antes de repetir una transacción reciente, revisa la actividad de tu wallet en Solana Explorer.",
        },
        errors: {
          rejected: "Rechazaste la solicitud en tu wallet. No se envió nada.",
          expired: "La transacción venció antes de confirmarse. No cambió nada. Inténtalo de nuevo.",
          uncertain: "Una transacción de este navegador sigue en curso. Espera su resultado antes de enviar otra.",
          insufficientSol: "No tienes SOL suficiente para la comisión de la red. Consigue SOL de prueba e inténtalo de nuevo.",
          insufficientTokens: "Tu wallet no tiene suficientes tokens de prueba tMXN para esto.",
          guard: "La wallet devolvió una transacción distinta a la preparada, así que no se envió nada.",
          busy: "Hay otra transacción en curso en este navegador. Espera a que termine.",
          journal: "Este navegador no pudo guardar el registro de la transacción, así que no se envió nada. Permite el almacenamiento del sitio e inténtalo de nuevo.",
          network: "No se pudo conectar con la red de Solana. Revisa tu conexión e inténtalo de nuevo.",
          noWallet: "Primero conecta una wallet.",
          generic: "No se pudo completar la transacción. Inténtalo de nuevo.",
          programGeneric: "El pool rechazó esta operación.",
          program: {
            paused: "El pool está en pausa. Depósitos, canjes y disposiciones están detenidos.",
            unauthorized: "Esta wallet no tiene permiso para hacer esto.",
            wrongAmount: "El monto es cero o mayor que lo adeudado.",
            insufficientLiquidity: "El pool no tiene liquidez suficiente para esto en este momento.",
            lineStatus: "Esta línea de crédito no está en un estado que lo permita.",
            termNotEnded: "El plazo de esta línea aún no termina.",
            overflow: "El monto es demasiado grande.",
            sponsorRequired: "El patrocinador nombrado en esta línea debe firmar.",
            zeroShares: "Este depósito es demasiado pequeño para recibir participaciones.",
            firstDepositTooSmall: "El primer depósito del pool debe ser de al menos 1 token de prueba tMXN.",
            wrongAccount: "Una cuenta de tokens no corresponde a este pool.",
            slippageExceeded:
              "El valor del pool cambió desde que lo revisaste y recibirías menos que el mínimo mostrado. Revisa los nuevos montos e inténtalo de nuevo.",
            termEnded: "El plazo de esta línea terminó.",
            invalidSchedule: "El calendario de pagos de esta línea no es válido.",
            scheduleEndsAfterTerm: "El último pago vencería después del fin del plazo.",
            notScheduled: "Esta línea no tiene calendario de pagos.",
            notEnoughMissed: "Esta línea no tiene suficientes pagos vencidos para pasar a cobranza.",
            lateInterestUnpaid: "El pago debe cubrir primero el interés moratorio de esta línea. Paga al menos ese monto.",
            writeOffTooEarly: "Esta línea aún no puede castigarse. El periodo de gracia no ha terminado.",
          },
        },
      },
    },
  },
};
