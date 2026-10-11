import { BRAND } from "./config";

// Every visible string on the page, in English and Spanish.
// Both languages must have exactly the same keys (tests/i18n.test.ts checks this
// and scans every value for words this page must never use).

export type Lang = "en" | "es";

// A short block: a few-word title and one line under it.
export type Card = { title: string; body: string };

// The scripted walkthrough in the agreement section (src/AgreementDemo.tsx). Sample data only.
export type DemoCopy = {
  label: string;
  sample: string;
  play: string;
  pause: string;
  steps: [Card, Card, Card, Card, Card];
  doc: string;
  borrower: string;
  borrowerValue: string;
  lender: string;
  lenderValue: string;
  principal: string;
  principalValue: string;
  interest: string;
  interestValue: string;
  term: string;
  termValue: string;
  signed: string;
  hash: string;
  hashNote: string;
  lineStatus: string;
  statusOpen: string;
  statusActive: string;
  statusRepaid: string;
  drawn: string;
  repaid: string;
  unit: string;
};

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
  };
  investors: { title: string; cards: [Card, Card, Card] };
  entrepreneurs: { title: string; cards: [Card, Card, Card] };
  flow: {
    title: string;
    nodes: [string, string, string, string, string];
    tags: [string, string, string, string, string];
  };
  agreement: {
    title: string;
    body: string;
    demo: DemoCopy;
  };
  lines: { title: string; body: string };
  footer: {
    powered: string;
    legal: string;
    terms: string;
    privacy: string;
  };
  app: {
    meta: { title: string };
    nav: { label: string; home: string; pool: string; invest: string; borrow: string; backToSite: string };
    header: { network: string; connect: string };
    home: { title: string; sub: string; invest: Card; borrow: Card; poolLink: string; connectPrompt: string };
    pool: {
      title: string;
      sub: string;
      address: string;
      viewAddress: string;
      newTab: string;
      statsTitle: string;
      statsNote: string;
      perShare: string;
      perShareHint: string;
      noShares: string;
      nav: string;
      navHint: string;
      liquidity: string;
      liquidityHint: string;
      outstanding: string;
      interestCollected: string;
      losses: string;
      lines: string;
      paused: string;
      linesTitle: string;
      linesSub: string;
      linesCaption: string;
      columns: {
        line: string;
        borrower: string;
        status: string;
        principal: string;
        drawn: string;
        repaid: string;
        due: string;
        sponsor: string;
      };
      noSponsor: string;
      noDate: string;
      unreadable: string;
      status: { approved: string; active: string; repaid: string; writtenOff: string; inCollection: string; unknown: string };
      empty: { title: string; body: string; link: string };
      loading: string;
      loadFailed: string;
      linesFailed: string;
      stale: string;
      retry: string;
      mismatch: { title: string; body: string };
    };
    invest: {
      title: string;
      sub: string;
      connectTitle: string;
      connectBody: string;
      wrongChainTitle: string;
      summaryTitle: string;
      summaryNote: string;
      yourShares: string;
      sharesValue: string;
      sharesValueHint: string;
      assetBalance: string;
      solBalance: string;
      solHint: string;
      solLow: string;
      loading: string;
      balancesFailed: string;
      balancesStale: string;
      poolFailed: string;
      retry: string;
      paused: string;
      shareUnit: string;
      deposit: {
        title: string;
        sub: string;
        label: string;
        available: string;
        max: string;
        maxLabel: string;
        preview: string;
        previewEmpty: string;
        firstNote: string;
        submit: string;
      };
      redeem: {
        title: string;
        sub: string;
        label: string;
        available: string;
        max: string;
        maxLabel: string;
        preview: string;
        previewEmpty: string;
        liquidityCap: string;
        noLiquidity: string;
        submit: string;
      };
      errors: {
        summary: string;
        required: string;
        invalid: string;
        tooManyDecimals: string;
        tooLarge: string;
        zero: string;
        aboveBalance: string;
        aboveShares: string;
        aboveLiquidity: string;
        tooSmall: string;
        notReady: string;
      };
    };
    faucet: {
      get: string;
      getting: string;
      sent: string;
      limited: string;
      unavailable: string;
      failed: string;
      sol: string;
      solGetting: string;
      solSent: string;
      solFailed: string;
      solFaucet: string;
      newTab: string;
      viewExplorer: string;
    };
    toast: {
      region: string;
      dismiss: string;
      sign: string;
      confirming: string;
      updated: string;
      progress: string;
      done: string;
      failed: string;
      cancelled: string;
      retry: string;
    };
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
      sub: "Your deposit funds credit lines for small businesses, like the panadería on your corner, with government support.",
      invest: "Invest",
      borrow: "Borrow",
    },
    pool: {
      title: "First pool soon: 100 credit lines for small businesses",
      body: "Every deposit joins one pool. Each credit line is opened from it and repaid into it.",
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
    },
    agreement: {
      title: "Programmable Real World Credits",
      body: "Auto-executable legal contracts. Each party signs the agreement with their own wallet, its hash opens the credit line on Solana, and the program carries out draws, repayments and write-offs by those terms.",
      demo: {
        label: "How a credit line runs, with sample data",
        sample: "Sample data",
        play: "Play walkthrough",
        pause: "Pause walkthrough",
        steps: [
          { title: "Draft", body: "The agreement is drafted from a pilot template under legal review." },
          { title: "Sign", body: "The borrower and the pool each sign with their own wallet." },
          { title: "Hash on chain", body: "The hash of the signed agreement opens the line on Solana." },
          { title: "Draw", body: "The borrower draws the money, within the signed terms." },
          { title: "Repay", body: "Repayments go back to the pool, as the agreement says." },
        ],
        doc: "Credit line agreement",
        borrower: "Borrower",
        borrowerValue: "Panadería La Espiga",
        lender: "Lender",
        lenderValue: "The pool",
        principal: "Principal",
        principalValue: "25,000 tMXN test tokens",
        interest: "Fixed interest",
        interestValue: "12% of principal",
        term: "Term",
        termValue: "180 days",
        signed: "Signed with their wallet",
        hash: "Agreement hash",
        hashNote: "Stored with the line. Only the hash goes on chain, not the document.",
        lineStatus: "Line status",
        statusOpen: "Open",
        statusActive: "Active",
        statusRepaid: "Repaid",
        drawn: "Drawn",
        repaid: "Repaid",
        unit: "tMXN test tokens",
      },
    },
    lines: {
      title: "For small businesses, with government support",
      body: "Every credit line we offer is for a small or medium business and comes with government support.",
    },
    footer: {
      powered: "Softlaw SA de CV",
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
      pool: {
        title: "The pool",
        sub: "Value per share, liquidity and every credit line, read from Solana.",
        address: "Pool account",
        viewAddress: "View on Solana Explorer",
        newTab: "opens in a new tab",
        statsTitle: "Pool figures",
        statsNote: "Amounts in tMXN, a test token.",
        perShare: "Value per share",
        perShareHint: "Pool value divided by all shares.",
        noShares: "No shares yet",
        nav: "Pool value",
        navHint: "Liquidity plus principal lent out.",
        liquidity: "Liquidity",
        liquidityHint: "On hand for redemptions and draws.",
        outstanding: "Principal lent out",
        interestCollected: "Interest collected",
        losses: "Losses recognized",
        lines: "Credit lines",
        paused: "The pool is paused. Deposits, redemptions and draws are on hold. Repayments still go through.",
        linesTitle: "Credit lines",
        linesSub: "Every line the pool has opened, newest last.",
        linesCaption: "Credit lines of this pool",
        columns: {
          line: "Line",
          borrower: "Borrower",
          status: "Status",
          principal: "Principal",
          drawn: "Drawn",
          repaid: "Repaid",
          due: "Due date",
          sponsor: "Sponsor",
        },
        noSponsor: "None",
        noDate: "Not set",
        unreadable: "This line could not be read.",
        status: {
          approved: "Approved",
          active: "Active",
          repaid: "Repaid",
          writtenOff: "Written off",
          inCollection: "In collection",
          unknown: "Unknown",
        },
        empty: {
          title: "No credit lines yet",
          body: "A line is opened by the pool administrator after the agreement is signed.",
          link: "How a line is opened",
        },
        loading: "Loading the pool",
        loadFailed: "The pool could not be read from Solana. Check your connection and try again.",
        linesFailed: "The credit lines could not be read from Solana. Try again.",
        stale: "These figures could not be refreshed. They show the last values read.",
        retry: "Try again",
        mismatch: {
          title: "This pool does not match the app settings",
          body: "The pool account on Solana is not the one this app was set up for, so nothing is shown. The site operator needs to update the app settings.",
        },
      },
      invest: {
        title: "Invest",
        sub: "Deposit tMXN test tokens for shares, or redeem shares when the pool has enough on hand.",
        connectTitle: "Connect a wallet to invest",
        connectBody: "Your shares and balances are read from the wallet you connect. Nothing is sent until you sign.",
        wrongChainTitle: "Switch networks to continue",
        summaryTitle: "Your position",
        summaryNote: "Amounts in tMXN, a test token.",
        yourShares: "Your shares",
        sharesValue: "Value of your shares",
        sharesValueHint: "Your shares times the value per share.",
        assetBalance: "Test token balance",
        solBalance: "SOL balance",
        solHint: "Pays the network fee of each transaction.",
        solLow: "Your SOL balance is low. You need a little SOL to pay network fees.",
        loading: "Loading your balances",
        balancesFailed: "Your balances could not be read from Solana. Try again.",
        balancesStale: "Your balances could not be refreshed. They show the last values read.",
        poolFailed: "The pool could not be read from Solana, so deposits and redemptions are on hold. Try again.",
        retry: "Try again",
        paused: "The pool is paused. Deposits and redemptions are on hold until it resumes.",
        shareUnit: "shares",
        deposit: {
          title: "Deposit",
          sub: "Deposit tMXN test tokens and receive pool shares.",
          label: "Amount to deposit",
          available: "Available: {amount} tMXN test tokens",
          max: "Max",
          maxLabel: "Use your whole balance",
          preview: "You receive about {expected} shares, minimum {min}.",
          previewEmpty: "Enter an amount to see the shares you receive.",
          firstNote:
            "This is the first deposit in the pool. It must be at least 1 tMXN test token, and 1,000 base units of shares (0.001 share) stay locked in the pool for good, so its value per share can never be reset.",
          submit: "Deposit",
        },
        redeem: {
          title: "Redeem",
          sub: "Return shares to the pool and receive tMXN test tokens from its liquidity.",
          label: "Shares to redeem",
          available: "Your shares: {amount}",
          max: "Max",
          maxLabel: "Use the most you can redeem now",
          preview: "You receive about {expected} tMXN test tokens, minimum {min}.",
          previewEmpty: "Enter a number of shares to see what you receive.",
          liquidityCap:
            "The pool has {liquidity} tMXN test tokens on hand, so you can redeem up to {max} shares now. More can be redeemed as loans are repaid.",
          noLiquidity: "The pool has no liquidity on hand right now. Shares can be redeemed as loans are repaid.",
          submit: "Redeem",
        },
        errors: {
          summary: "Check this before continuing:",
          required: "Enter an amount.",
          invalid: "Enter a number, such as 25 or 25.5.",
          tooManyDecimals: "Use at most 6 decimals.",
          tooLarge: "This amount is too large.",
          zero: "Enter an amount greater than zero.",
          aboveBalance: "This is more than your balance of tMXN test tokens.",
          aboveShares: "This is more than the shares you hold.",
          aboveLiquidity: "The pool can pay out up to {max} shares right now.",
          tooSmall: "This is too few shares to receive any test tokens.",
          notReady: "Your balances are still loading. Try again in a moment.",
        },
      },
      faucet: {
        get: "Get test tokens",
        getting: "Requesting…",
        sent: "Test tokens are on their way. They show in your balance in a few seconds.",
        limited: "One request per wallet per day. Try again tomorrow.",
        unavailable: "Test tokens are not available right now. Try again later.",
        failed: "The request did not go through. Check your connection and try again.",
        sol: "Get test SOL",
        solGetting: "Requesting…",
        solSent: "Test SOL requested. It shows in your balance in a few seconds.",
        solFailed: "The network did not send test SOL right now. Use the Solana faucet instead.",
        solFaucet: "Open the Solana faucet",
        newTab: "opens in a new tab",
        viewExplorer: "View on Solana Explorer",
      },
      toast: {
        region: "Notifications",
        dismiss: "Dismiss",
        sign: "Sign in wallet",
        confirming: "Confirming",
        updated: "Updated",
        progress: "{op} in progress",
        done: "{op} confirmed",
        failed: "{op} did not go through",
        cancelled: "{op} cancelled",
        retry: "Try again",
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
      sub: "Tu depósito fondea líneas de crédito para negocios pequeños, como la panadería de tu esquina, con apoyo de gobierno.",
      invest: "Invertir",
      borrow: "Pedir crédito",
    },
    pool: {
      title: "Primer pool muy pronto: 100 créditos para pymes",
      body: "Cada depósito entra a un solo pool. Cada línea de crédito se abre desde ahí y se paga de vuelta ahí.",
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
    },
    agreement: {
      title: "Créditos programables del mundo real",
      body: "Contratos legales autoejecutables. Cada parte firma el contrato con su propia wallet, su hash abre la línea de crédito en Solana y el programa ejecuta disposiciones, pagos y castigos según esos términos.",
      demo: {
        label: "Cómo funciona una línea de crédito, con datos de muestra",
        sample: "Datos de muestra",
        play: "Reproducir recorrido",
        pause: "Pausar recorrido",
        steps: [
          { title: "Redactar", body: "El contrato se redacta con una plantilla piloto en revisión legal." },
          { title: "Firmar", body: "Quien pide el crédito y el pool firman, cada uno con su propia wallet." },
          { title: "Hash en la cadena", body: "El hash del contrato firmado abre la línea en Solana." },
          { title: "Disponer", body: "Quien pide el crédito dispone del dinero, dentro de los términos firmados." },
          { title: "Pagar", body: "Los pagos regresan al pool, como dice el contrato." },
        ],
        doc: "Contrato de línea de crédito",
        borrower: "Acreditado",
        borrowerValue: "Panadería La Espiga",
        lender: "Acreedor",
        lenderValue: "El pool",
        principal: "Principal",
        principalValue: "25,000 tokens de prueba tMXN",
        interest: "Interés fijo",
        interestValue: "12% del principal",
        term: "Plazo",
        termValue: "180 días",
        signed: "Firmó con su wallet",
        hash: "Hash del contrato",
        hashNote: "Se guarda con la línea. Solo el hash va a la cadena, no el documento.",
        lineStatus: "Estado de la línea",
        statusOpen: "Abierta",
        statusActive: "Activa",
        statusRepaid: "Pagada",
        drawn: "Dispuesto",
        repaid: "Pagado",
        unit: "tokens de prueba tMXN",
      },
    },
    lines: {
      title: "Para pymes, con apoyo de gobierno",
      body: "Todas las líneas de crédito que ofrecemos son para pequeñas y medianas empresas y cuentan con apoyo de gobierno.",
    },
    footer: {
      powered: "Softlaw SA de CV",
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
      pool: {
        title: "El pool",
        sub: "Valor por participación, liquidez y cada línea de crédito, leídos de Solana.",
        address: "Cuenta del pool",
        viewAddress: "Ver en Solana Explorer",
        newTab: "se abre en una pestaña nueva",
        statsTitle: "Cifras del pool",
        statsNote: "Montos en tMXN, un token de prueba.",
        perShare: "Valor por participación",
        perShareHint: "Valor del pool dividido entre todas las participaciones.",
        noShares: "Aún no hay participaciones",
        nav: "Valor del pool",
        navHint: "Liquidez más el principal prestado.",
        liquidity: "Liquidez",
        liquidityHint: "Disponible para canjes y disposiciones.",
        outstanding: "Principal prestado",
        interestCollected: "Interés cobrado",
        losses: "Pérdidas reconocidas",
        lines: "Líneas de crédito",
        paused: "El pool está en pausa. Depósitos, canjes y disposiciones están detenidos. Los pagos siguen entrando.",
        linesTitle: "Líneas de crédito",
        linesSub: "Cada línea que ha abierto el pool, la más reciente al final.",
        linesCaption: "Líneas de crédito de este pool",
        columns: {
          line: "Línea",
          borrower: "Acreditado",
          status: "Estado",
          principal: "Principal",
          drawn: "Dispuesto",
          repaid: "Pagado",
          due: "Vencimiento",
          sponsor: "Patrocinador",
        },
        noSponsor: "Ninguno",
        noDate: "Sin fecha",
        unreadable: "No se pudo leer esta línea.",
        status: {
          approved: "Aprobada",
          active: "Activa",
          repaid: "Pagada",
          writtenOff: "Castigada",
          inCollection: "En cobranza",
          unknown: "Desconocida",
        },
        empty: {
          title: "Aún no hay líneas de crédito",
          body: "El administrador del pool abre una línea después de que se firma el contrato.",
          link: "Cómo se abre una línea",
        },
        loading: "Cargando el pool",
        loadFailed: "No se pudo leer el pool en Solana. Revisa tu conexión e inténtalo de nuevo.",
        linesFailed: "No se pudieron leer las líneas de crédito en Solana. Inténtalo de nuevo.",
        stale: "No se pudieron actualizar estas cifras. Muestran los últimos valores leídos.",
        retry: "Intentar de nuevo",
        mismatch: {
          title: "Este pool no coincide con la configuración de la app",
          body: "La cuenta del pool en Solana no es la que se configuró para esta app, así que no se muestra nada. Quien opera el sitio debe actualizar la configuración de la app.",
        },
      },
      invest: {
        title: "Invertir",
        sub: "Deposita tokens de prueba tMXN a cambio de participaciones, o canjéalas cuando el pool tenga liquidez.",
        connectTitle: "Conecta una wallet para invertir",
        connectBody: "Tus participaciones y saldos se leen de la wallet que conectes. No se envía nada hasta que firmes.",
        wrongChainTitle: "Cambia de red para continuar",
        summaryTitle: "Tu posición",
        summaryNote: "Montos en tMXN, un token de prueba.",
        yourShares: "Tus participaciones",
        sharesValue: "Valor de tus participaciones",
        sharesValueHint: "Tus participaciones por el valor de cada una.",
        assetBalance: "Saldo en tokens de prueba",
        solBalance: "Saldo de SOL",
        solHint: "Paga la comisión de red de cada transacción.",
        solLow: "Tu saldo de SOL es bajo. Necesitas un poco de SOL para pagar las comisiones de la red.",
        loading: "Cargando tus saldos",
        balancesFailed: "No se pudieron leer tus saldos en Solana. Inténtalo de nuevo.",
        balancesStale: "No se pudieron actualizar tus saldos. Muestran los últimos valores leídos.",
        poolFailed: "No se pudo leer el pool en Solana, así que los depósitos y canjes están detenidos. Inténtalo de nuevo.",
        retry: "Intentar de nuevo",
        paused: "El pool está en pausa. Los depósitos y canjes están detenidos hasta que se reanude.",
        shareUnit: "participaciones",
        deposit: {
          title: "Depositar",
          sub: "Deposita tokens de prueba tMXN y recibe participaciones del pool.",
          label: "Monto a depositar",
          available: "Disponible: {amount} tokens de prueba tMXN",
          max: "Máx.",
          maxLabel: "Usar todo tu saldo",
          preview: "Recibes alrededor de {expected} participaciones, mínimo {min}.",
          previewEmpty: "Escribe un monto para ver las participaciones que recibes.",
          firstNote:
            "Este es el primer depósito del pool. Debe ser de al menos 1 token de prueba tMXN, y 1,000 unidades base de participaciones (0.001 participación) quedan bloqueadas en el pool para siempre, para que su valor por participación nunca pueda reiniciarse.",
          submit: "Depositar",
        },
        redeem: {
          title: "Canjear",
          sub: "Devuelve participaciones al pool y recibe tokens de prueba tMXN de su liquidez.",
          label: "Participaciones a canjear",
          available: "Tus participaciones: {amount}",
          max: "Máx.",
          maxLabel: "Usar lo máximo que puedes canjear ahora",
          preview: "Recibes alrededor de {expected} tokens de prueba tMXN, mínimo {min}.",
          previewEmpty: "Escribe un número de participaciones para ver lo que recibes.",
          liquidityCap:
            "El pool tiene {liquidity} tokens de prueba tMXN disponibles, así que ahora puedes canjear hasta {max} participaciones. Podrás canjear más conforme se paguen los préstamos.",
          noLiquidity: "El pool no tiene liquidez disponible en este momento. Las participaciones se pueden canjear conforme se paguen los préstamos.",
          submit: "Canjear",
        },
        errors: {
          summary: "Revisa esto antes de continuar:",
          required: "Escribe un monto.",
          invalid: "Escribe un número, como 25 o 25.5.",
          tooManyDecimals: "Usa como máximo 6 decimales.",
          tooLarge: "Este monto es demasiado grande.",
          zero: "Escribe un monto mayor que cero.",
          aboveBalance: "Es más que tu saldo de tokens de prueba tMXN.",
          aboveShares: "Es más que las participaciones que tienes.",
          aboveLiquidity: "El pool puede pagar hasta {max} participaciones en este momento.",
          tooSmall: "Son muy pocas participaciones para recibir tokens de prueba.",
          notReady: "Tus saldos aún se están cargando. Inténtalo de nuevo en un momento.",
        },
      },
      faucet: {
        get: "Obtener tokens de prueba",
        getting: "Solicitando…",
        sent: "Los tokens de prueba van en camino. Aparecen en tu saldo en unos segundos.",
        limited: "Una solicitud por wallet al día. Inténtalo de nuevo mañana.",
        unavailable: "Los tokens de prueba no están disponibles por ahora. Inténtalo más tarde.",
        failed: "La solicitud no se completó. Revisa tu conexión e inténtalo de nuevo.",
        sol: "Obtener SOL de prueba",
        solGetting: "Solicitando…",
        solSent: "SOL de prueba solicitado. Aparece en tu saldo en unos segundos.",
        solFailed: "La red no envió SOL de prueba en este momento. Usa el faucet de Solana.",
        solFaucet: "Abrir el faucet de Solana",
        newTab: "se abre en una pestaña nueva",
        viewExplorer: "Ver en Solana Explorer",
      },
      toast: {
        region: "Notificaciones",
        dismiss: "Cerrar",
        sign: "Firma en tu wallet",
        confirming: "Confirmando",
        updated: "Actualizado",
        progress: "{op} en curso",
        done: "{op}: transacción confirmada",
        failed: "{op}: la transacción no se completó",
        cancelled: "{op}: cancelaste la solicitud",
        retry: "Intentar de nuevo",
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
