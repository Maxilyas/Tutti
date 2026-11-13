import { defineConfig } from 'vitest/config';

// Les tests unitaires ne portent que sur le moteur de jeu (src/shared) :
// pas besoin de navigateur ni de serveur.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
