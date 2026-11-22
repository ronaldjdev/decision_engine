/**
 * Clase base DDD para Objetos de Valor (Value Objects) inmutables.
 * Su igualdad se determina estructuralmente por el valor de sus propiedades.
 */
export abstract class ValueObject<TProps extends Record<string, unknown>> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  /** Evalúa igualdad estructural entre dos Value Objects del mismo tipo. */
  public equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (!other) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
