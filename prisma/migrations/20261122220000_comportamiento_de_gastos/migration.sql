-- Fijo o variable: lo unico que falta para poder calcular el punto de equilibrio.
--
-- Todo arranca en FIJO a proposito. Suponer que un gasto es fijo deja el punto de equilibrio
-- mas ALTO de lo real; suponerlo variable lo deja mas bajo y haria creer que ya se alcanzo
-- cuando no. De los dos errores posibles, este es el que no cuesta dinero.
CREATE TYPE "CostBehavior" AS ENUM ('FIJO', 'VARIABLE');

ALTER TABLE "expense_categories"
  ADD COLUMN "behavior" "CostBehavior" NOT NULL DEFAULT 'FIJO';

ALTER TABLE "product_categories"
  ADD COLUMN "behavior" "CostBehavior" NOT NULL DEFAULT 'FIJO';
