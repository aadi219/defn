// Core's tsconfig has no DOM or Node types; tests only need the timer for performance budgets.
declare const performance: { now(): number };
