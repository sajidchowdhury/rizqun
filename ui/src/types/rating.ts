/** Rating types — mirrors backend's rating-related DTOs. */

export interface RatingLinkResult {
  orderCode: string;
  ratingToken: string;
  url: string;
}

export interface RatingFormData {
  orderCode: string;
  customerName: string;
}

export interface SubmittedRating {
  orderId: number;
  orderCode: string;
  overall: number;
  speed: number;
  behavior: number;
  comment: string | null;
  submittedAt: string;
}

// Response wrappers
export interface RatingLinkResponse {
  orderCode: string;
  ratingToken: string;
  url: string;
}

export interface RatingFormResponse {
  orderCode: string;
  customerName: string;
}

export interface SubmitRatingPayload {
  token: string;
  overall: number;
  speed: number;
  behavior: number;
  comment?: string;
}
