import { InvariantViolationError } from '../../../shared/domain/DomainError.ts';

export type ExceptionStatus = 'pendiente' | 'aprobada' | 'rechazada';

export interface JustifiedExceptionRequestProps {
  readonly id: string;
  readonly leadId: string;
  readonly ruleCode: string;
  readonly justification: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly status: ExceptionStatus;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly reviewComment?: string;
}

export class JustifiedExceptionRequest {
  public readonly props: JustifiedExceptionRequestProps;

  private constructor(props: JustifiedExceptionRequestProps) {
    this.props = Object.freeze({ ...props });
  }

  public static submit(input: {
    id: string;
    leadId: string;
    ruleCode: string;
    justification: string;
    requestedBy: string;
    requestedAt: string;
  }): JustifiedExceptionRequest {
    if (input.justification.trim().length < 10) {
      throw new InvariantViolationError(
        'La justificación de la excepción debe tener al menos 10 caracteres.',
      );
    }
    return new JustifiedExceptionRequest({
      ...input,
      status: 'pendiente',
    });
  }

  public review(input: {
    decision: 'aprobada' | 'rechazada';
    reviewedBy: string;
    reviewedAt: string;
    comment?: string;
  }): JustifiedExceptionRequest {
    if (this.props.status !== 'pendiente') {
      throw new InvariantViolationError(
        `La excepción '${this.props.id}' ya fue resuelta con estado '${this.props.status}'.`,
      );
    }
    return new JustifiedExceptionRequest({
      ...this.props,
      status: input.decision,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt,
      reviewComment: input.comment,
    });
  }

  public toJSON(): JustifiedExceptionRequestProps {
    return { ...this.props };
  }
}
