import type { ColorResolvable, ComponentsV2Builder, V2ButtonInput, V2FileInput, V2GalleryInput, V2SectionFieldRow } from "../ComponentsV2Builder";

export interface V2CardSectionConfig {
  heading?: string;
  title?: string;
  rows?: Array<V2SectionFieldRow | false | null | undefined>;
  fields?: Array<V2SectionFieldRow | false | null | undefined>;
  text?: string;
  separator?: boolean | "small" | "large";
  omitIfEmpty?: boolean;
  fallback?: string;
}

export interface V2CardOptions {
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  spoiler?: boolean;
  safeMentions?: boolean;
  title?: string;
  subtitle?: string;
  headingLevel?: 1 | 2 | 3;
  thumbnail?: string | null;
  thumbnailDescription?: string;
  thumbnailSpoiler?: boolean;
  headerButton?: V2ButtonInput;
  headerSeparator?: boolean;
  description?: string;
  overflow?: "file" | "clip" | "split";
  overflowFilename?: string;
  maxDescriptionLength?: number;
  fields?: Array<V2SectionFieldRow | false | null | undefined>;
  fieldsSeparator?: boolean;
  omitEmptyFields?: boolean;
  fieldFallback?: string;
  sections?: Array<V2CardSectionConfig | false | null | undefined>;
  gallery?: V2GalleryInput;
  image?: V2GalleryInput;
  gallerySeparator?: boolean;
  ignoreInvalidMedia?: boolean;
  separatorSpacing?: "small" | "large";
  files?: Array<V2FileInput | Buffer | string | false | null | undefined>;
  footer?: string;
  footerSeparator?: boolean;
  buttons?: Array<V2ButtonInput | false | null | undefined>;
  buttonSpacer?: boolean;
  outsideButtons?: Array<V2ButtonInput | false | null | undefined>;
}

export interface V2ImageViewLink {
  label?: string;
  url: string;
  style?: "link" | "primary" | "secondary" | "success" | "danger";
  emoji?: string | { id?: string; name?: string; animated?: boolean };
  disabled?: boolean;
}

export interface V2ImageViewOptions {
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  spoiler?: boolean;
  safeMentions?: boolean;
  title?: string;
  subtitle?: string;
  headingLevel?: 1 | 2 | 3;
  description?: string;
  image?: V2GalleryInput;
  images?: V2GalleryInput;
  gallery?: V2GalleryInput;
  url?: string | null;
  imageDescription?: string;
  imageSpoiler?: boolean;
  ignoreInvalidMedia?: boolean;
  links?: V2ImageViewLink[];
  buttons?: Array<V2ButtonInput | false | null | undefined>;
  outsideButtons?: Array<V2ButtonInput | false | null | undefined>;
  footer?: string;
}

export interface V2ListOptions<T = unknown> {
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  spoiler?: boolean;
  safeMentions?: boolean;
  title?: string;
  subtitle?: string;
  headingLevel?: 1 | 2 | 3;
  thumbnail?: string | null;
  items?: T[];
  renderItem?: (item: T, index: number) => string;
  numbered?: boolean;
  startIndex?: number;
  itemSeparator?: string;
  emptyText?: string;
  overflow?: "file" | "clip" | "split";
  overflowFilename?: string;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  pageFormatter?: (page: number, totalPages: number, totalItems?: number) => string;
  footer?: string;
  buttons?: Array<V2ButtonInput | false | null | undefined>;
  outsideButtons?: Array<V2ButtonInput | false | null | undefined>;
}

export interface V2ConfirmOptions {
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  spoiler?: boolean;
  safeMentions?: boolean;
  title?: string;
  headingLevel?: 1 | 2 | 3;
  message?: string;
  description?: string;
  warning?: string;
  confirmId?: string;
  cancelId?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: "primary" | "secondary" | "success" | "danger" | number;
  cancelStyle?: "primary" | "secondary" | "success" | "danger" | number;
  confirmEmoji?: string | { id?: string; name?: string; animated?: boolean };
  cancelEmoji?: string | { id?: string; name?: string; animated?: boolean };
  disabled?: boolean;
  outsideButtons?: Array<V2ButtonInput | false | null | undefined>;
}

export declare function createCard(options?: V2CardOptions): ComponentsV2Builder;
export declare function createImageView(options?: V2ImageViewOptions): ComponentsV2Builder;
export declare function createList<T = unknown>(options?: V2ListOptions<T>): ComponentsV2Builder;
export declare function createConfirm(options: V2ConfirmOptions): ComponentsV2Builder;
export declare function createConfirm(confirmId: string, cancelId: string, title?: string, message?: string): ComponentsV2Builder;
export declare function createTicketMenu(
  customId: string,
  title?: string,
  description?: string
): {
  builder: ComponentsV2Builder;
  select: ReturnType<ComponentsV2Builder["addSelectMenu"]>;
};
export declare function createPlanSelector(
  customId: string,
  title?: string,
  description?: string
): {
  builder: ComponentsV2Builder;
  select: ReturnType<ComponentsV2Builder["addSelectMenu"]>;
};
export declare function createRoleMenu(
  customId: string,
  title?: string,
  description?: string
): {
  builder: ComponentsV2Builder;
  select: ReturnType<ComponentsV2Builder["addSelectMenu"]>;
};
