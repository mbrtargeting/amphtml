import '../../amp-a4a/0.1/real-time-config-manager';
import {AmpA4A} from '../../amp-a4a/0.1/amp-a4a';
import {Deferred} from '../../../src/utils/promise';
import {buildUrl} from './../../../ads/google/a4a/shared/url-builder';
import {Services} from '../../../src/services';
import {tryParseJson} from '../../../src/json';
import {getOrCreateAdCid} from '../../../src/ad-cid';
import {dev} from '../../../src/log';

/** @const {string} */
const FAKEDFP_BASE_URL = 'https://prebid-support.lsd.test/ads';

function serializeItem_(key, value) {
  const serializedValue = (Array.isArray(value) ? value : [value])
    .map(encodeURIComponent)
    .join();
  return `${encodeURIComponent(key)}=${serializedValue}`;
}

function serializeTargeting_(
  targeting
) {
  const serialized = targeting
    ? Object.keys(targeting).map(key => serializeItem_(key, targeting[key]))
    : [];
  return serialized.length ? serialized.join('&') : null;
}

function buildFakeDfpUrl(targeting) {
  const parameters = {'scp': serializeTargeting_(targeting)};
  return buildUrl(FAKEDFP_BASE_URL, parameters, 16384);
}

export class AmpAdNetworkFakedfpImpl extends AmpA4A {
  /**
   * @param {!Element} element
   */
  constructor(element) {
    super(element);

    /** @protected {!Deferred<string>} */
    this.getAdUrlDeferred = new Deferred();

    /** @type {?JsonObject|Object} */
    this.jsonTargeting = null;
  }

  /** @override */
  getAdUrl(unusedConsentState, opt_rtcResponsesPromise) {
    opt_rtcResponsesPromise = opt_rtcResponsesPromise || Promise.resolve();
    opt_rtcResponsesPromise.then(result => {

      // Example successful response: {"response":{"targeting":{"hb_bidder":"stroeerCore","hb_cache_id":"0195991b-b143-4e8a-8289-b5e29670a601","hb_pb":"3.20","hb_size":"300x250"}},"rtcTime":878,"callout":"localhost/openrtb2/amp"}
      // Example error response: {"error":"10","callout":"localhost/openrtb2/amp","rtcTime":878}

      const targeting =
        result && result[0].response && result[0].response['targeting'];
      if (!targeting) {
        console.warn('No targeting received from prebid server');
      }

      this.getAdUrlDeferred.resolve(buildFakeDfpUrl(targeting));
    });

    return this.getAdUrlDeferred.promise;
  }

  /** @override */
  sendXhrRequest(adUrl) {
    return super.sendXhrRequest(adUrl);
  }

  /** @override */
  extractSize(responseHeaders) {
    const size = super.extractSize(responseHeaders);
    if (size) {
      this.handleResize_(size.width, size.height);
    }
    return size;
  }

  /** @override */
  getCustomRealTimeConfigMacros_() {
    /**
     * This whitelist allow attributes on the amp-ad element to be used as
     * macros for constructing the RTC URL. Add attributes here, in lowercase,
     * to make them available.
     */
    const whitelist = {
      'height': true,
      'width': true,
      'data-slot': true,
      'data-multi-size': true,
      'data-multi-size-validation': true,
      'data-override-width': true,
      'data-override-height': true,
    };

    return {
      PAGEVIEWID: () => Services.documentInfoForDoc(this.element).pageViewId,
      HREF: () => this.win.location.href,
      REFERRER: opt_timeout => this.getReferrer_(opt_timeout),
      TGT: () =>
        JSON.stringify(
          (tryParseJson(this.element.getAttribute('json')) || {})['targeting']
        ),
      ADCID: opt_timeout =>
        getOrCreateAdCid(
          this.getAmpDoc(),
          'AMP_ECID_GOOGLE',
          '_ga',
          parseInt(opt_timeout, 10)
        ),
      ATTR: name => {
        if (!whitelist[name.toLowerCase()]) {
          dev().warn('TAG', `Invalid attribute ${name}`);
        } else {
          return this.element.getAttribute(name);
        }
      },
      CANONICAL_URL: () =>
        Services.documentInfoForDoc(this.element).canonicalUrl,
    };
  }

  handleResize_(newWidth, newHeight) {
    const {width, height} = this.getDeclaredSlotSize_();
    const returnedSizeDifferent = newWidth !== width || newHeight !== height;
    if (returnedSizeDifferent) {
      console.log(`Attempt to change size from ${width}x${height} to ${newWidth}x${newHeight}...`);
      this.attemptChangeSize(newHeight, newWidth)
        .then(() => { console.log('Change size successful.'); })
        .catch(() => { console.log('Change size denied.'); });
    }
  }

  getDeclaredSlotSize_() {
    const width = Number(this.element.getAttribute('width'));
    const height = Number(this.element.getAttribute('height'));
    return {width, height};
  }
}

AMP.extension('amp-ad-network-fakedfp-impl', '0.1', AMP => {
  AMP.registerElement('amp-ad-network-fakedfp-impl', AmpAdNetworkFakedfpImpl);
});
