import "server-only";

export { createCommunity, type CreateCommunityResult } from "./services/create-community";
export { deleteCommunity, type DeleteCommunityResult } from "./services/delete-community";
export {
  getCurrentCommunitySettings,
  type CurrentCommunitySettingsReadModel,
} from "./services/get-current-community-settings";
export {
  updateCommunityBasicInfo,
  type UpdateCommunityBasicInfoResult,
} from "./services/update-community-basic-info";
export {
  updateCommunityProfileVisibility,
  type UpdateCommunityProfileVisibilityResult,
} from "./services/update-community-profile-visibility";
export {
  updateCommunityLegalDisclosureVisibility,
  type UpdateCommunityLegalDisclosureVisibilityResult,
} from "./services/update-community-legal-disclosure-visibility";
export {
  getPublicCommunityBySlug,
  getPublicCommunityByLegalSlug,
} from "./services/get-public-community";
export { createCommunityContact } from "./services/create-community-contact";
export {
  createCommunitySchema,
  updateCommunityBasicInfoSchema,
  updateCommunityLegalDisclosureVisibilitySchema,
  updateCommunityProfileVisibilitySchema,
  type CreateCommunityInput,
  type UpdateCommunityBasicInfoInput,
  type UpdateCommunityLegalDisclosureVisibilityInput,
  type UpdateCommunityProfileVisibilityInput,
} from "./validation";
