import { ValidationError } from '../DomainError.ts';
import { ValueObject } from '../ValueObject.ts';

interface MoneyProps extends Record<string, unknown> {
  amount: number;
  currency: 'COP';
}

/**
 * Value Object que representa montos monetarios en Pesos Colombianos (COP).
 * Redondea a enteros para evitar imprecisiones de punto flotante en cálculos financieros.
 */
export class Money extends ValueObject<MoneyProps> {
  public readonly amount: number;
  public readonly currency: 'COP';

  private constructor(amount: number) {
    super({ amount, currency: 'COP' });
    this.amount = amount;
    this.currency = 'COP';
  }

  /**
   * Crea una instancia `Money` en COP validando que el valor sea finito.
   * @throws ValidationError Si el monto es `NaN` o infinito.
   */
  public static cop(amount: number): Money {
    if (!Number.isFinite(amount)) {
      throw new ValidationError('El monto en COP debe ser un número finito.', {
        amount,
      });
    }
    return new Money(Math.round(amount));
  }

  /** Retorna un monto de `$0 COP`. */
  public static zero(): Money {
    return new Money(0);
  }

  /** Multiplica el monto por un factor escalar y retorna un nuevo `Money`. */
  public multiply(factor: number): Money {
    return Money.cop(this.amount * factor);
  }

  /** Resta otro monto truncando el resultado a `$0 COP` como mínimo. */
  public subtractFloorZero(other: Money): Money {
    return Money.cop(Math.max(0, this.amount - other.amount));
  }

  public isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    return this.amount >= other.amount;
  }

  public isLessThan(other: Money): boolean {
    return this.amount < other.amount;
  }

  /** Formatea el monto en notación colombiana legible (`$1.400.000 COP`). */
  public format(): string {
    return `$${this.amount.toLocaleString('es-CO')} COP`;
  }
}
