-- Los cuatro grupos con los que el Estado de Resultados presenta los gastos.
CREATE TYPE "ExpenseGroup" AS ENUM ('ADMINISTRACION', 'OPERACION', 'PERSONAL', 'FINANCIEROS');

-- Nullable y sin default a proposito: un tipo de gasto que nadie ha clasificado se muestra en
-- su propio renglon del reporte, no se mete a un grupo que nadie eligio.
ALTER TABLE "expense_categories" ADD COLUMN "expenseGroup" "ExpenseGroup";
ALTER TABLE "product_categories" ADD COLUMN "expenseGroup" "ExpenseGroup";
