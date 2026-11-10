import { Injectable } from '@angular/core';
import { DefaultUrlSerializer, UrlSerializer, UrlTree } from '@angular/router';

/** Query parameter that reveals the hidden article editor, e.g. https://example/codex/some-article?edit=1 */
export const EDIT_PARAM = 'edit';

/** True while the address carries `?edit=1`. Removing the parameter from the address turns it off. */
@Injectable({ providedIn: 'root' })
export class EditModeService {
  active = false;
}

/**
 * Parses and writes addresses like the default serializer, but while edit mode is on it adds
 * `?edit=1` to every address the router builds (links, redirects), so the mode persists as the
 * user navigates. The address is the single source of truth: parsing one without the parameter
 * (a reload, or the user deleting it) turns the mode off.
 */
@Injectable()
export class EditModeUrlSerializer extends DefaultUrlSerializer {
  constructor(private mode: EditModeService) {
    super();
  }

  override parse(url: string): UrlTree {
    const tree = super.parse(url);
    const value = tree.queryParams[EDIT_PARAM];
    this.mode.active = value !== undefined && value !== '0' && value !== 'false';
    return tree;
  }

  override serialize(tree: UrlTree): string {
    if (this.mode.active && tree.queryParams[EDIT_PARAM] === undefined) {
      tree = new UrlTree(tree.root, { ...tree.queryParams, [EDIT_PARAM]: '1' }, tree.fragment);
    }
    return super.serialize(tree);
  }
}
