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
    stepsTitle: string;
    steps: [Card, Card, Card, Card];
    chips: [string, string, string, string];
    position: string;
    sample: string;
    tokens: string;
    tokensValue: string;
    curvePrice: string;
    curvePriceValue: string;
    perShare: string;
    perShareValue: string;
    marketPrice: string;
    marketPriceValue: string;
    atSettle: string;
    atSettleValue: string;
    status: string;
    statusValue: string;
    marketNote: string;
    note: string;
    fieldLabel: string;
    play: string;
    pause: string;
    replay: string;
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
  // Two photos under the lines block. Alt text describes the scene and never names people.
  meeting: { caption: string; photoA: string; photoB: string };
  footer: {
    powered: string;
    legal: string;
    terms: string;
    privacy: string;
  };
  app: {
    meta: { title: string };
    nav: {
      label: string;
      pool: string;
      invest: string;
      borrow: string;
      backToSite: string;
      poolLink: string;
      /** Tab sub-lines from live data. {n} is the formatted figure. */
      lineOne: string;
      lineMany: string;
      sharesUnit: string;
      toRepay: string;
    };
    header: { network: string; connect: string };
    pool: {
      title: string;
      /** The word of the title that glows on night. */
      titleGlow: string;
      sub: string;
      readAt: string;
      you: string;
      outstandingShort: string;
      interestShort: string;
      lossesShort: string;
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
      launchLink: string;
    };
    launch: {
      title: string;
      sub: string;
      note: string;
      notLaunched: { title: string; body: string };
      loading: string;
      loadFailed: string;
      stale: string;
      retry: string;
      mismatch: { title: string; notFound: string; quoteMismatch: string; accountsMismatch: string };
      flowTitle: string;
      flowSub: string;
      stage: { trading: string; thresholdReached: string; graduated: string };
      progressLabel: string;
      curve: { title: string; body: string; raised: string; of: string; feesWaiting: string };
      graduation: { title: string; body: string; threshold: string; price: string; priceHint: string; priceLater: string };
      vault: {
        title: string;
        body: string;
        received: string;
        claimed: string;
        treasuryCan: string;
        treasuryShare: string;
        feesGoToVault: string;
        feesElsewhere: string;
        treasuryNotUser: string;
      };
      credit: { title: string; body: string; holds: string; shares: string; about: string; perShare: string; poolUnavailable: string };
      addresses: {
        title: string;
        sub: string;
        dbcConfig: string;
        dbcPool: string;
        baseToken: string;
        quoteToken: string;
        feeVault: string;
        treasury: string;
        treasuryShareAccount: string;
        dammPool: string;
        dammPending: string;
        programDbc: string;
        programDammV2: string;
        programFeeSharing: string;
        viewAddress: string;
        newTab: string;
      };
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
      perShareNote: string;
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
        dust: string;
      };
    };
    faucet: {
      hint: string;
      teamNote: string;
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
      pending: string;
      pendingBody: string;
      expired: string;
      expiredBody: string;
    };
    borrow: {
      title: string;
      sub: string;
      connectTitle: string;
      connectBody: string;
      loading: string;
      linesFailed: string;
      linesStale: string;
      poolFailed: string;
      balancesFailed: string;
      retry: string;
      paused: string;
      unitNote: string;
      yourLines: string;
      yourLinesSub: string;
      sponsored: string;
      sponsoredSub: string;
      empty: { title: string; body: string };
      line: string;
      linesLabel: string;
      fields: {
        principal: string;
        rate: string;
        interest: string;
        drawn: string;
        repaid: string;
        remaining: string;
        termEnd: string;
        drawnAt: string;
        sponsor: string;
        borrower: string;
      };
      unknownBody: string;
      repaidNote: string;
      writtenOffNote: string;
      agreement: {
        title: string;
        hash: string;
        copy: string;
        copied: string;
        template: string;
        status: string;
        signatures: string;
        signaturesValue: string;
        created: string;
        evidence: string;
        statuses: { draft: string; pendingSignatures: string; signed: string; anchored: string };
      };
      draw: {
        title: string;
        body: string;
        submit: string;
        pausedNote: string;
        liquidityNote: string;
        termEndedNote: string;
        scheduleNote: string;
      };
      repay: {
        title: string;
        sub: string;
        label: string;
        available: string;
        max: string;
        maxLabel: string;
        dueNow: string;
        estimate: string;
        preview: string;
        previewSettles: string;
        previewEmpty: string;
        orderV1: string;
        orderV2: string;
        submit: string;
      };
      schedule: {
        title: string;
        every: string;
        caption: string;
        number: string;
        due: string;
        amount: string;
        state: string;
        afterDraw: string;
        states: { paid: string; partial: string; overdue: string; pending: string };
      };
      late: {
        title: string;
        rate: string;
        collected: string;
        dueNow: string;
        grace: string;
        noGrace: string;
      };
      inCollection: string;
      errors: { aboveDue: string; belowLateInterest: string };
    };
    history: {
      title: string;
      sub: string;
      lineToggle: string;
      lineSub: string;
      loading: string;
      failed: string;
      stale: string;
      retry: string;
      empty: { title: string; body: string };
      lineEmpty: string;
      view: string;
      rows: {
        deposited: string;
        redeemed: string;
        lineOpened: string;
        lineDrawn: string;
        lineRepaid: string;
        lateInterest: string;
        scheduled: string;
        inCollection: string;
        writtenOff: string;
        other: string;
        failed: string;
      };
    };
    newTab: string;
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
      /** "The wallet said: {message}", after connectFailed. */
      walletSaid: string;
      /** The wallet connected but shared no account. {network} is app.header.network. */
      noAccount: string;
      /** Brave's built-in wallet holds window.solana and no extension wallet is listed. */
      braveHint: string;
      connectedAs: string;
      menu: string;
      copy: string;
      copied: string;
      disconnect: string;
      close: string;
      wrongChain: string;
      /** The account lists Solana Mainnet only. {network} is app.header.network. */
      wrongChainMainnet: string;
    };
    tx: {
      steps: { simulating: string; signing: string; sending: string; confirming: string; done: string };
      signingButton: string;
      pendingButton: string;
      pendingNote: string;
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
      title: "First pool soon: from a Meteora curve to 100 credit lines",
      body: "Planned for the first pool: you would buy its token on a Meteora curve, and the raise would fund credit lines for small businesses.",
      stepsTitle: "How it will work, in four steps",
      steps: [
        {
          title: "You buy on the curve",
          body: "You pay with tMXN, a test token, on a Meteora curve whose price is nearly flat, and you receive the pool's token.",
        },
        {
          title: "The raise flows into the pool",
          body: "When the curve fills, it graduates: 99% of the raise flows into the pool's vault, and 1% opens the token's market on Meteora.",
        },
        {
          title: "The pool opens credit lines",
          body: "Each elote is one credit line for a small business, opened from an agreement that both sides sign.",
        },
        {
          title: "Interest and write-offs move the value per share",
          body: "Until the pool settles, the only exit is selling on the Meteora market, where the price can be below the value per share. After settle, each token redeems for its share of the vault.",
        },
      ],
      chips: ["1/4 Raising", "2/4 Into the pool", "3/4 Credit lines", "4/4 Value per share"],
      position: "Sample position",
      sample: "Sample data",
      tokens: "Tokens in your wallet",
      tokensValue: "100",
      curvePrice: "Price on the curve",
      curvePriceValue: "About 1 tMXN (a test token), nearly flat",
      perShare: "Value per share",
      perShareValue: "Rises with interest paid, falls with write-offs",
      marketPrice: "Market price",
      marketPriceValue: "Set by buyers and sellers on Meteora",
      atSettle: "When the pool settles",
      atSettleValue: "Redeems for its share of the vault",
      status: "Status",
      statusValue: "Planned",
      marketNote: "The market price can be below the value per share, and at settle a token can redeem for less than you paid.",
      note: "Planned, not live yet. tMXN is a test token with no value. The token does not exist yet. It would be the pool share, with no claim beyond what the pool pays at settle, and none on Softlaw.",
      fieldLabel: "A night field of one hundred elotes, one for each planned credit line. The four steps beside it describe what it shows.",
      play: "Play the four steps",
      pause: "Pause the animation",
      replay: "Replay the four steps",
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
      title: "Programmable Loans Contracts",
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
    meeting: {
      caption: "Early conversations with the municipal team in Playas de Rosarito, Baja California, 2026. No agreement has been signed.",
      photoA: "Meeting room in Playas de Rosarito: four people around a table with a printed city map, faces blurred",
      photoB: "Two people at the meeting table, faces blurred",
    },
    footer: {
      powered: "Softlaw SA de CV",
      legal: "Legal",
      terms: "Terms",
      privacy: "Privacy",
    },
    app: {
      meta: { title: `App | ${BRAND}` },
      nav: {
        label: "Sections",
        pool: "Pool",
        invest: "Invest",
        borrow: "Borrow",
        backToSite: `Back to ${BRAND}`,
        poolLink: "See the pool",
        lineOne: "{n} line",
        lineMany: "{n} lines",
        sharesUnit: "shares",
        toRepay: "{n} to repay",
      },
      header: { network: "Devnet", connect: "Connect wallet" },
      pool: {
        title: "The pool",
        titleGlow: "pool",
        readAt: "Read {time}",
        you: "You",
        outstandingShort: "Lent out",
        interestShort: "Interest",
        lossesShort: "Losses",
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
        launchLink: "See the launch preset",
      },
      launch: {
        title: "Launch preset",
        sub: "A demo token sold on a Meteora bonding curve. Its fees go to a vault, and the treasury deposits its part into the elote credit pool.",
        note: "tELOTE is the demo token of the elote credit preset. It has no value and gives no claim on the credit pool. 20% of the raise and the trade fees go to the preset's fee vault and do not come back to buyers.",
        notLaunched: {
          title: "Not launched yet",
          body: "The preset has not been launched on this network. Its curve, fee vault and treasury will show here once it is.",
        },
        loading: "Reading the preset from Solana",
        loadFailed: "The preset could not be read from Solana. Check your connection and try again.",
        stale: "These figures could not be refreshed. They show the last values read.",
        retry: "Try again",
        mismatch: {
          title: "This preset does not match the app settings",
          notFound: "One of the preset accounts is missing on Solana or is not the Meteora account it should be. The site operator needs to update the preset addresses.",
          quoteMismatch: "The preset's curve is priced in another token than this app's test token, so nothing is shown. The site operator needs to update the preset addresses.",
          accountsMismatch: "The preset accounts on Solana do not belong together, so nothing is shown. The site operator needs to update the preset addresses.",
        },
        flowTitle: "How the fees move",
        flowSub: "Four steps, read live from Solana. Amounts in tMXN, a test token.",
        stage: {
          trading: "Trading on the curve",
          thresholdReached: "Threshold reached, graduation pending",
          graduated: "Graduated to DAMM v2",
        },
        progressLabel: "Curve progress",
        curve: {
          title: "Curve",
          body: "tELOTE is sold for the test token on a nearly flat curve.",
          raised: "Raised on the curve",
          of: "{raised} of {threshold}",
          feesWaiting: "Trade fees waiting to move to the vault",
        },
        graduation: {
          title: "Graduation",
          body: "At the threshold the curve closes and its liquidity moves to a DAMM v2 pool on Meteora. 20% of the raise goes to the fee vault.",
          threshold: "Graduation threshold",
          price: "Price on Meteora",
          priceHint: "Test token per tELOTE, read from the DAMM v2 pool.",
          priceLater: "Shown after graduation",
        },
        vault: {
          title: "Fee vault",
          body: "The trade fees, the graduation fee and the DAMM v2 position fees go here.",
          received: "Received by the vault",
          claimed: "Claimed",
          treasuryCan: "Treasury can claim",
          treasuryShare: "Treasury share of the vault",
          feesGoToVault: "The curve sends its fees to this vault.",
          feesElsewhere: "The curve sends its fees to another address, not this vault.",
          treasuryNotUser: "The treasury has no share in this vault.",
        },
        credit: {
          title: "Credit pool",
          body: "The treasury deposits what it claims into the elote credit pool and receives pool shares.",
          holds: "Treasury holds",
          shares: "shares",
          about: "about {amount}",
          perShare: "Value per share",
          poolUnavailable: "The credit pool could not be read right now.",
        },
        addresses: {
          title: "Accounts",
          sub: "Every account of the preset, on Solana Explorer.",
          dbcConfig: "Curve settings",
          dbcPool: "Curve pool",
          baseToken: "tELOTE, the demo token",
          quoteToken: "Quote token: tMXN, a test token",
          feeVault: "Fee vault",
          treasury: "Treasury",
          treasuryShareAccount: "Treasury pool share account",
          dammPool: "DAMM v2 pool",
          dammPending: "Created at graduation",
          programDbc: "Dynamic Bonding Curve program",
          programDammV2: "DAMM v2 program",
          programFeeSharing: "Dynamic Fee Sharing program",
          viewAddress: "View on Solana Explorer",
          newTab: "opens in a new tab",
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
        perShareNote: "{n} per share",
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
          aboveLiquidity: "You can redeem up to {max} shares right now.",
          tooSmall: "This is too few shares to receive any test tokens.",
          dust: "This amount is too small to be worth sending.",
        },
      },
      faucet: {
        hint: "Adds tMXN, a test token, to this wallet so you can try a deposit.",
        teamNote: "Test tokens for this demo are handed out by the team. tMXN is a test token with no value.",
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
        pending: "{op}: result pending",
        pendingBody: "The network has not confirmed it yet; the page updates when it does.",
        expired: "{op} expired",
        expiredBody: "It expired before it was confirmed. Nothing changed; you can try again.",
      },
      borrow: {
        title: "Borrow",
        sub: "Draw your approved line and repay it from your wallet.",
        connectTitle: "Connect a wallet to see your lines",
        connectBody: "Your credit lines are read for the wallet you connect. Nothing is sent until you sign.",
        loading: "Loading your lines",
        linesFailed: "Your credit lines could not be read from Solana. Try again.",
        linesStale: "Your lines could not be refreshed. They show the last values read.",
        poolFailed: "The pool could not be read from Solana, so draws and repayments are on hold. Try again.",
        balancesFailed: "Your test token balance could not be read, so repayments are on hold. Try again.",
        retry: "Try again",
        paused: "The pool is paused. Draws are on hold until it resumes. Repayments still go through.",
        unitNote: "Amounts in tMXN, a test token.",
        yourLines: "Your lines",
        yourLinesSub: "Credit lines opened for this wallet.",
        sponsored: "Lines you sponsor",
        sponsoredSub: "This wallet is named as sponsor. Anyone can repay a line, so you use the same form.",
        empty: {
          title: "No lines for this wallet.",
          body: "Lines are opened by the pool administrator after the agreement is signed.",
        },
        line: "Line {id}",
        linesLabel: "Credit lines",
        fields: {
          principal: "Principal",
          rate: "Interest rate",
          interest: "Fixed interest",
          drawn: "Drawn",
          repaid: "Repaid",
          remaining: "Still owed",
          termEnd: "Due date",
          drawnAt: "Drawn on",
          sponsor: "Sponsor",
          borrower: "Borrower",
        },
        unknownBody: "This line uses a format this app cannot read yet, so no figures or actions are shown.",
        repaidNote: "This line is fully repaid.",
        writtenOffNote: "The pool wrote off the unpaid principal of this line.",
        agreement: {
          title: "Agreement",
          hash: "Agreement hash",
          copy: "Copy hash",
          copied: "Hash copied",
          template: "Template",
          status: "Agreement status",
          signatures: "Signatures",
          signaturesValue: "{count} of {total}",
          created: "Drafted on",
          evidence: "Evidence",
          statuses: { draft: "Draft", pendingSignatures: "Waiting for signatures", signed: "Signed", anchored: "Recorded on Solana" },
        },
        draw: {
          title: "Draw",
          body: "Moves the whole principal of {amount} tMXN test tokens to this wallet. Your wallet asks you to sign.",
          submit: "Draw",
          pausedNote: "Draws are on hold while the pool is paused.",
          liquidityNote: "The pool does not have enough liquidity on hand for this draw right now.",
          termEndedNote: "The term of this line has ended, so it can no longer be drawn.",
          scheduleNote: "Drawn now, the last installment would fall due after the end of the term, so this line cannot be drawn.",
        },
        repay: {
          title: "Repay",
          sub: "Partial repayments are allowed.",
          label: "Amount to repay",
          available: "Available: {amount} tMXN test tokens",
          max: "Max",
          maxLabel: "Use the most this line takes now, up to your balance",
          dueNow: "Due now: {amount} tMXN test tokens",
          estimate: "Late interest is an estimate at this moment; the exact amount is settled on chain when the repayment lands.",
          preview: "You repay {amount} tMXN test tokens.",
          previewSettles: "You repay {amount} tMXN test tokens, which settles this line.",
          previewEmpty: "Enter an amount to repay.",
          orderV1: "Repayments go to principal first, then to interest.",
          orderV2: "Repayments settle late interest first, then interest, then principal. The pool takes only what is due.",
          submit: "Repay",
        },
        schedule: {
          title: "Installments",
          every: "{count} installments, one every {interval}.",
          caption: "Installments of this line",
          number: "Installment",
          due: "Due",
          amount: "Amount",
          state: "Status",
          afterDraw: "Due dates count from the draw.",
          states: { paid: "Paid", partial: "Partly paid", overdue: "Overdue", pending: "Upcoming" },
        },
        late: {
          title: "Late interest",
          rate: "Late interest rate, yearly",
          collected: "Late interest paid",
          dueNow: "Late interest due now",
          grace: "Late interest accrues on overdue installments after a grace period of {grace}.",
          noGrace: "Late interest accrues on overdue installments from their due date.",
        },
        inCollection: "This line is in collection because installments were missed past the grace period. Repayments still go through.",
        errors: {
          aboveDue: "This line takes at most {max} tMXN test tokens right now.",
          belowLateInterest: "Pay at least {min} tMXN test tokens: the late interest due on this line comes first.",
        },
      },
      history: {
        title: "Activity",
        sub: "Your last 20 transactions with this pool's shares, newest first.",
        lineToggle: "History",
        lineSub: "The last 20 transactions of this line, newest first.",
        loading: "Loading activity",
        failed: "The activity could not be loaded.",
        stale: "The activity could not be refreshed. Showing the last list read.",
        retry: "Try again",
        empty: { title: "No activity yet", body: "Your deposits and redemptions appear here once they are confirmed." },
        lineEmpty: "No transactions for this line yet.",
        view: "View transaction",
        rows: {
          deposited: "Deposited {assets} tMXN test tokens for {shares} shares",
          redeemed: "Redeemed {shares} shares for {assets} tMXN test tokens",
          lineOpened: "Line opened for {principal} tMXN test tokens",
          lineDrawn: "Drew {amount} tMXN test tokens",
          lineRepaid: "Repaid {principal} tMXN test tokens of principal and {interest} of interest",
          lateInterest: "Paid {amount} tMXN test tokens of late interest",
          scheduled: "Schedule set: {installments} installments, one every {interval}",
          inCollection: "Sent to collection after {missed} missed installments",
          writtenOff: "Written off with a loss of {loss} tMXN test tokens",
          other: "Pool transaction",
          failed: "Failed",
        },
      },
      newTab: "opens in a new tab",
      notFound: { title: "Page not found", body: "This address does not match any page of the app.", home: "Go to the pool" },
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
        walletSaid: "The wallet said: {message}",
        noAccount: "The wallet shared no Solana account. Open the wallet, pick a Solana account for {network} and try again.",
        braveHint: "Brave is set to its own Solana wallet. In brave://settings/web3 set the default Solana wallet to Extensions, then reload.",
        connectedAs: "Connected wallet",
        menu: "Wallet options",
        copy: "Copy address",
        copied: "Address copied",
        disconnect: "Disconnect",
        close: "Close",
        wrongChain:
          "This wallet account is not on the network this app uses, shown at the top of the page. Switch networks in your wallet and connect again.",
        wrongChainMainnet:
          "This wallet is set to Solana Mainnet. Switch it to {network} and connect again. In Phantom: Settings, Developer settings, Testnet mode.",
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
        pendingButton: "Waiting for the result",
        pendingNote: "Your last transaction was sent and its result is not known yet. You can send again once it settles.",
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
      title: "Primer pool pronto: curva de Meteora, 100 líneas de crédito",
      body: "Así lo planeamos para el primer pool: comprarías su token en una curva de Meteora y lo recaudado iría a líneas de crédito para pymes.",
      stepsTitle: "Cómo funcionará, en cuatro pasos",
      steps: [
        {
          title: "Compras en la curva",
          body: "Pagas con tMXN, un token de prueba, en una curva de precios de Meteora casi plana y recibes el token del pool.",
        },
        {
          title: "Lo recaudado entra al pool",
          body: "Cuando la curva se llena, se gradúa: el 99% de lo recaudado entra a la bóveda del pool y el 1% abre el mercado del token en Meteora.",
        },
        {
          title: "El pool abre líneas de crédito",
          body: "Cada elote es una línea de crédito para una pyme, abierta con un contrato que firman ambas partes.",
        },
        {
          title: "Los intereses y los castigos mueven el valor por participación",
          body: "Hasta el cierre del pool, la única salida es vender en el mercado de Meteora, donde el precio puede quedar debajo del valor por participación. Después, cada token se canjea por su parte de la bóveda.",
        },
      ],
      chips: ["1/4 Recaudando", "2/4 Al pool", "3/4 Líneas de crédito", "4/4 Valor por participación"],
      position: "Posición de muestra",
      sample: "Datos de muestra",
      tokens: "Tokens en tu wallet",
      tokensValue: "100",
      curvePrice: "Precio en la curva",
      curvePriceValue: "Cerca de 1 tMXN (un token de prueba), casi plano",
      perShare: "Valor por participación",
      perShareValue: "Sube con los intereses pagados, baja con los castigos",
      marketPrice: "Precio de mercado",
      marketPriceValue: "Lo fijan compradores y vendedores en Meteora",
      atSettle: "Al cierre del pool",
      atSettleValue: "Se canjea por su parte de la bóveda",
      status: "Estado",
      statusValue: "Planeado",
      marketNote: "El precio de mercado puede quedar debajo del valor por participación, y al cierre un token puede canjearse por menos de lo que pagaste.",
      note: "Planeado, todavía no está activo. tMXN es un token de prueba sin valor. El token aún no existe. Sería la participación en el pool, sin derecho más allá de lo que el pool pague a su cierre, y ninguno frente a Softlaw.",
      fieldLabel: "Un campo nocturno de cien elotes, uno por cada línea de crédito planeada. Los cuatro pasos de al lado describen lo que muestra.",
      play: "Reproducir los cuatro pasos",
      pause: "Pausar la animación",
      replay: "Repetir los cuatro pasos",
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
      title: "Contratos de préstamo programables",
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
    meeting: {
      caption: "Primeras conversaciones con el equipo municipal de Playas de Rosarito, Baja California, 2026. No hay ningún acuerdo firmado.",
      photoA: "Sala de reuniones en Playas de Rosarito: cuatro personas alrededor de una mesa con un mapa impreso de la ciudad, rostros difuminados",
      photoB: "Dos personas en la mesa de la reunión, rostros difuminados",
    },
    footer: {
      powered: "Softlaw SA de CV",
      legal: "Legal",
      terms: "Términos",
      privacy: "Privacidad",
    },
    app: {
      meta: { title: `App | ${BRAND}` },
      nav: {
        label: "Secciones",
        pool: "Pool",
        invest: "Invertir",
        borrow: "Pedir crédito",
        backToSite: `Volver a ${BRAND}`,
        poolLink: "Ver el pool",
        lineOne: "{n} línea",
        lineMany: "{n} líneas",
        sharesUnit: "participaciones",
        toRepay: "{n} por pagar",
      },
      header: { network: "Devnet", connect: "Conectar wallet" },
      pool: {
        title: "El pool",
        titleGlow: "pool",
        readAt: "Leído el {time}",
        you: "Tú",
        outstandingShort: "Prestado",
        interestShort: "Interés",
        lossesShort: "Pérdidas",
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
        launchLink: "Ver el lanzamiento",
      },
      launch: {
        title: "Lanzamiento en Meteora",
        sub: "Un token de demostración que se vende en una curva de precios de Meteora. Sus comisiones van a una bóveda, y la tesorería deposita su parte en el pool de crédito de elote.",
        note: "tELOTE es el token de demostración del lanzamiento de crédito de elote. No tiene valor y no da ningún derecho sobre el pool de crédito. El 20% de lo recaudado y las comisiones de compraventa van a la bóveda de comisiones del lanzamiento y no regresan a los compradores.",
        notLaunched: {
          title: "Aún no se lanza",
          body: "El lanzamiento aún no se realiza en esta red. Su curva, su bóveda de comisiones y su tesorería aparecerán aquí cuando se realice.",
        },
        loading: "Leyendo el lanzamiento en Solana",
        loadFailed: "No se pudo leer el lanzamiento en Solana. Revisa tu conexión e inténtalo de nuevo.",
        stale: "No se pudieron actualizar estas cifras. Muestran los últimos valores leídos.",
        retry: "Intentar de nuevo",
        mismatch: {
          title: "Este lanzamiento no coincide con la configuración de la app",
          notFound: "Falta una de las cuentas del lanzamiento en Solana, o no es la cuenta de Meteora que debería ser. Quien opera el sitio debe actualizar las direcciones del lanzamiento.",
          quoteMismatch: "La curva del lanzamiento cotiza en otro token y no en el token de prueba de esta app, así que no se muestra nada. Quien opera el sitio debe actualizar las direcciones del lanzamiento.",
          accountsMismatch: "Las cuentas del lanzamiento en Solana no corresponden entre sí, así que no se muestra nada. Quien opera el sitio debe actualizar las direcciones del lanzamiento.",
        },
        flowTitle: "Cómo se mueven las comisiones",
        flowSub: "Cuatro pasos, leídos en vivo de Solana. Montos en tMXN, un token de prueba.",
        stage: {
          trading: "En venta en la curva",
          thresholdReached: "Umbral alcanzado, graduación pendiente",
          graduated: "Graduado a DAMM v2",
        },
        progressLabel: "Avance de la curva",
        curve: {
          title: "Curva",
          body: "tELOTE se vende a cambio del token de prueba en una curva casi plana.",
          raised: "Recaudado en la curva",
          of: "{raised} de {threshold}",
          feesWaiting: "Comisiones de compraventa por pasar a la bóveda",
        },
        graduation: {
          title: "Graduación",
          body: "Al llegar al umbral, la curva se cierra y su liquidez pasa a un pool DAMM v2 de Meteora. El 20% de lo recaudado va a la bóveda de comisiones.",
          threshold: "Umbral de graduación",
          price: "Precio en Meteora",
          priceHint: "Token de prueba por cada tELOTE, leído del pool DAMM v2.",
          priceLater: "Se muestra después de la graduación",
        },
        vault: {
          title: "Bóveda de comisiones",
          body: "Aquí llegan las comisiones de compraventa, la comisión de graduación y las comisiones de la posición en DAMM v2.",
          received: "Recibido por la bóveda",
          claimed: "Reclamado",
          treasuryCan: "La tesorería puede reclamar",
          treasuryShare: "Parte de la tesorería en la bóveda",
          feesGoToVault: "La curva envía sus comisiones a esta bóveda.",
          feesElsewhere: "La curva envía sus comisiones a otra dirección, no a esta bóveda.",
          treasuryNotUser: "La tesorería no tiene parte en esta bóveda.",
        },
        credit: {
          title: "Pool de crédito",
          body: "La tesorería deposita lo que reclama en el pool de crédito de elote y recibe participaciones del pool.",
          holds: "La tesorería tiene",
          shares: "participaciones",
          about: "unos {amount}",
          perShare: "Valor por participación",
          poolUnavailable: "No se pudo leer el pool de crédito en este momento.",
        },
        addresses: {
          title: "Cuentas",
          sub: "Todas las cuentas del lanzamiento, en Solana Explorer.",
          dbcConfig: "Configuración de la curva",
          dbcPool: "Pool de la curva",
          baseToken: "tELOTE, el token de demostración",
          quoteToken: "Token de cotización: tMXN, un token de prueba",
          feeVault: "Bóveda de comisiones",
          treasury: "Tesorería",
          treasuryShareAccount: "Cuenta de participaciones de la tesorería",
          dammPool: "Pool DAMM v2",
          dammPending: "Se crea en la graduación",
          programDbc: "Programa Dynamic Bonding Curve",
          programDammV2: "Programa DAMM v2",
          programFeeSharing: "Programa Dynamic Fee Sharing",
          viewAddress: "Ver en Solana Explorer",
          newTab: "se abre en una pestaña nueva",
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
        perShareNote: "{n} por participación",
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
          aboveLiquidity: "Ahora puedes canjear hasta {max} participaciones.",
          tooSmall: "Son muy pocas participaciones para recibir tokens de prueba.",
          dust: "Este monto es demasiado pequeño para que valga la pena enviarlo.",
        },
      },
      faucet: {
        hint: "Agrega tMXN, un token de prueba, a esta wallet para que pruebes un depósito.",
        teamNote: "Los tokens de prueba de esta demo los entrega el equipo. tMXN es un token de prueba sin valor.",
        get: "Obtener tokens de prueba",
        getting: "Solicitando…",
        sent: "Los tokens de prueba van en camino. Aparecen en tu saldo en unos segundos.",
        limited: "Una solicitud por wallet al día. Inténtalo de nuevo mañana.",
        unavailable: "Los tokens de prueba no están disponibles por ahora. Inténtalo más tarde.",
        failed: "La solicitud no se completó. Revisa tu conexión e inténtalo de nuevo.",
        sol: "Obtener SOL de prueba",
        solGetting: "Solicitando…",
        solSent: "SOL de prueba solicitado. Aparece en tu saldo en unos segundos.",
        solFailed: "La red no envió SOL de prueba en este momento. Usa el grifo de Solana.",
        solFaucet: "Abrir el grifo de Solana",
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
        pending: "{op}: resultado pendiente",
        pendingBody: "La red aún no confirma la transacción; la página se actualiza cuando lo haga.",
        expired: "{op}: la transacción venció",
        expiredBody: "Venció antes de confirmarse. No cambió nada; puedes intentarlo de nuevo.",
      },
      borrow: {
        title: "Pedir crédito",
        sub: "Retira el crédito de tu línea aprobada y págalo desde tu wallet.",
        connectTitle: "Conecta una wallet para ver tus líneas",
        connectBody: "Tus líneas de crédito se leen de la wallet que conectes. No se envía nada hasta que firmes.",
        loading: "Cargando tus líneas",
        linesFailed: "No se pudieron leer tus líneas de crédito en Solana. Inténtalo de nuevo.",
        linesStale: "No se pudieron actualizar tus líneas. Muestran los últimos valores leídos.",
        poolFailed: "No se pudo leer el pool en Solana, así que las disposiciones y los pagos están detenidos. Inténtalo de nuevo.",
        balancesFailed: "No se pudo leer tu saldo de tokens de prueba, así que los pagos están detenidos. Inténtalo de nuevo.",
        retry: "Intentar de nuevo",
        paused: "El pool está en pausa. Las disposiciones están detenidas hasta que se reanude. Los pagos siguen entrando.",
        unitNote: "Montos en tMXN, un token de prueba.",
        yourLines: "Tus líneas",
        yourLinesSub: "Líneas de crédito abiertas para esta wallet.",
        sponsored: "Líneas que patrocinas",
        sponsoredSub: "Esta wallet figura como patrocinadora. Cualquiera puede pagar una línea, así que usas el mismo formulario.",
        empty: {
          title: "No hay líneas para esta wallet.",
          body: "El administrador del pool abre las líneas cuando el contrato está firmado.",
        },
        line: "Línea {id}",
        linesLabel: "Líneas de crédito",
        fields: {
          principal: "Principal",
          rate: "Tasa de interés",
          interest: "Interés fijo",
          drawn: "Dispuesto",
          repaid: "Pagado",
          remaining: "Saldo pendiente",
          termEnd: "Vencimiento",
          drawnAt: "Dispuesta el",
          sponsor: "Patrocinador",
          borrower: "Acreditado",
        },
        unknownBody: "Esta línea usa un formato que la app aún no puede leer, así que no se muestran cifras ni acciones.",
        repaidNote: "Esta línea está pagada por completo.",
        writtenOffNote: "El pool castigó el principal no pagado de esta línea.",
        agreement: {
          title: "Contrato",
          hash: "Hash del contrato",
          copy: "Copiar hash",
          copied: "Hash copiado",
          template: "Plantilla",
          status: "Estado del contrato",
          signatures: "Firmas",
          signaturesValue: "{count} de {total}",
          created: "Redactado el",
          evidence: "Evidencia",
          statuses: { draft: "Borrador", pendingSignatures: "Esperando firmas", signed: "Firmado", anchored: "Registrado en Solana" },
        },
        draw: {
          title: "Disponer",
          body: "Transfiere todo el principal de {amount} tokens de prueba tMXN a esta wallet. Tu wallet te pide firmar.",
          submit: "Disponer",
          pausedNote: "Las disposiciones están detenidas mientras el pool está en pausa.",
          liquidityNote: "El pool no tiene liquidez suficiente para esta disposición en este momento.",
          termEndedNote: "El plazo de esta línea terminó, así que ya no se puede disponer.",
          scheduleNote: "Si se dispone ahora, el último pago vencería después del fin del plazo, así que esta línea no se puede disponer.",
        },
        repay: {
          title: "Pagar",
          sub: "Se permiten pagos parciales.",
          label: "Monto a pagar",
          available: "Disponible: {amount} tokens de prueba tMXN",
          max: "Máx.",
          maxLabel: "Usar lo máximo que esta línea recibe ahora, hasta tu saldo",
          dueNow: "Exigible ahora: {amount} tokens de prueba tMXN",
          estimate: "El interés moratorio es una estimación a este momento; el monto exacto se liquida en cadena cuando entra el pago.",
          preview: "Pagas {amount} tokens de prueba tMXN.",
          previewSettles: "Pagas {amount} tokens de prueba tMXN, con lo que se liquida esta línea.",
          previewEmpty: "Escribe un monto a pagar.",
          orderV1: "Los pagos se aplican primero al principal y después al interés.",
          orderV2: "Los pagos cubren primero el interés moratorio, después el interés y al final el principal. El pool toma solo lo exigible.",
          submit: "Pagar",
        },
        schedule: {
          title: "Calendario de pagos",
          every: "{count} pagos, uno cada {interval}.",
          caption: "Pagos de esta línea",
          number: "Pago",
          due: "Vence",
          amount: "Monto",
          state: "Estado",
          afterDraw: "Las fechas de pago cuentan desde la disposición.",
          states: { paid: "Pagado", partial: "Pagado en parte", overdue: "Vencido", pending: "Por vencer" },
        },
        late: {
          title: "Interés moratorio",
          rate: "Tasa moratoria anual",
          collected: "Interés moratorio pagado",
          dueNow: "Interés moratorio exigible ahora",
          grace: "El interés moratorio corre sobre los pagos vencidos después de un periodo de gracia de {grace}.",
          noGrace: "El interés moratorio corre sobre los pagos vencidos desde su fecha de vencimiento.",
        },
        inCollection: "Esta línea está en cobranza porque se dejaron de hacer pagos después del periodo de gracia. Los pagos siguen entrando.",
        errors: {
          aboveDue: "Esta línea recibe como máximo {max} tokens de prueba tMXN en este momento.",
          belowLateInterest: "Paga al menos {min} tokens de prueba tMXN: primero se cubre el interés moratorio de esta línea.",
        },
      },
      history: {
        title: "Actividad",
        sub: "Tus últimas 20 transacciones con las participaciones de este pool, de la más reciente a la más antigua.",
        lineToggle: "Historial",
        lineSub: "Las últimas 20 transacciones de esta línea, de la más reciente a la más antigua.",
        loading: "Cargando la actividad",
        failed: "No se pudo cargar la actividad.",
        stale: "No se pudo actualizar la actividad. Se muestra la última lista leída.",
        retry: "Intentar de nuevo",
        empty: { title: "Aún no hay actividad", body: "Tus depósitos y canjes aparecen aquí cuando se confirman." },
        lineEmpty: "Aún no hay transacciones de esta línea.",
        view: "Ver transacción",
        rows: {
          deposited: "Depositó {assets} tokens de prueba tMXN por {shares} participaciones",
          redeemed: "Canjeó {shares} participaciones por {assets} tokens de prueba tMXN",
          lineOpened: "Línea abierta por {principal} tokens de prueba tMXN",
          lineDrawn: "Dispuso {amount} tokens de prueba tMXN",
          lineRepaid: "Pagó {principal} tokens de prueba tMXN de principal y {interest} de interés",
          lateInterest: "Pagó {amount} tokens de prueba tMXN de interés moratorio",
          scheduled: "Calendario fijado: {installments} pagos, uno cada {interval}",
          inCollection: "Pasó a cobranza tras {missed} pagos vencidos",
          writtenOff: "Castigada con una pérdida de {loss} tokens de prueba tMXN",
          other: "Transacción del pool",
          failed: "Fallida",
        },
      },
      newTab: "se abre en una pestaña nueva",
      notFound: { title: "Página no encontrada", body: "Esta dirección no corresponde a ninguna página de la app.", home: "Ir al pool" },
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
        walletSaid: "La wallet respondió: {message}",
        noAccount: "La wallet no compartió ninguna cuenta de Solana. Abre la wallet, elige una cuenta de Solana para {network} e inténtalo de nuevo.",
        braveHint: "Brave está usando su propia wallet de Solana. En brave://settings/web3 elige Extensiones como wallet de Solana predeterminada y vuelve a cargar la página.",
        connectedAs: "Wallet conectada",
        menu: "Opciones de la wallet",
        copy: "Copiar dirección",
        copied: "Dirección copiada",
        disconnect: "Desconectar",
        close: "Cerrar",
        wrongChain:
          "Esta cuenta de la wallet no está en la red que usa esta app, indicada arriba en la página. Cambia de red en tu wallet y vuelve a conectar.",
        wrongChainMainnet:
          "Esta wallet está en Solana Mainnet. Cámbiala a {network} y vuelve a conectar. En Phantom: Configuración, Configuración de desarrollador, Modo testnet.",
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
        pendingButton: "Esperando el resultado",
        pendingNote: "Tu última transacción se envió y su resultado aún no se conoce. Podrás enviar otra cuando se resuelva.",
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
