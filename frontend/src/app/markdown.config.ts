import { Parser, Token, Tokens, TokensList } from "marked";
import { MarkdownModuleConfig, MARKED_OPTIONS, MarkedRenderer } from "ngx-markdown";

const matchCustomEmbedRegEx = /^\[(video|audio|image)-embedded#]\((.*?)\)/;
const matchYoutubeRegEx = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/|shorts\/)?)(?<id>[\w\-]+)(\S+)?$/;

const customEmbedExtension = {
  extensions: [{
    name: 'custom_embed',
    level: 'inline',
    start: (src: string) => src.match(matchCustomEmbedRegEx)?.index ?? src.match(matchYoutubeRegEx)?.index,
    tokenizer: (src: string, tokens: Token[] | TokensList) => {
      let match = src.match(matchCustomEmbedRegEx);
      if (match) {
        return {
          type: 'custom_embed',
          raw: match[0],
          meta: { type: match[1], url: match[2] },
        };
      }

      match = src.match(matchYoutubeRegEx);
      if (match && match.groups?.['id']) {
        const isShorts = match[0].includes('/shorts/');
        return {
          type: 'custom_embed',
          raw: match[0],
          meta: {
            type: 'youtube',
            id: match.groups['id'],
            isShorts: isShorts
          },
        };
      }

      return undefined;
    },
    renderer: (token: Tokens.Generic) => {
      const { type, url, id, isShorts } = token['meta'];
      switch (type) {
        case 'video':
          return `<div style="max-width: 300px; height: auto;"><video controls style="width: 100%; height: auto;"><source src="${url}" type="video/mp4"></video></div>`;
        case 'audio':
          return `<div><audio src="${url}" controls></audio></div>`;
        case 'image':
          return `<div style="max-width: 300px; height: auto;"><img src="${url}" class="img-fluid" width="300px"></div>`;
        case 'youtube':
          const containerStyle = isShorts
            ? 'position: relative; max-width: 200px; height: auto;'
            : 'position: relative; max-width: 300px; height: auto;';
          const imgStyle = isShorts
            ? 'width: 100%; aspect-ratio: 9/16; object-fit: cover;'
            : 'width: 100%;';
          
          // Different icons for Shorts vs regular videos
          if (isShorts) {
            // YouTube Shorts icon (custom SVG)
            return `<div style="${containerStyle}">
              <img youtubeid="${id}" isshorts="true" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="img-fluid" style="${imgStyle}">
              <svg youtubeid="${id}" isshorts="true" style="position: absolute; place-self: anchor-center; width: 50px; height: 50px; cursor: pointer;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="3" width="14" height="18" rx="3" fill="#FF0000"/>
                <path d="M10 8.5L15 12L10 15.5V8.5Z" fill="white"/>
              </svg>
            </div>`;
          } else {
            // Regular YouTube icon
            const iconStyle = 'position: absolute; place-self: anchor-center; color: red; font-size: 70px;';
            return `<div style="${containerStyle}">
              <img youtubeid="${id}" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="img-fluid" style="${imgStyle}">
              <i class="bi bi-youtube" youtubeid="${id}" style="${iconStyle}"></i>
            </div>`;
          }
        default:
          return '';
      }
    }
  }]
}

const renderer = new MarkedRenderer();

renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

export const MarkdownConfig: MarkdownModuleConfig = {
  markedExtensions: [customEmbedExtension],
  markedOptions: {
    provide: MARKED_OPTIONS,
    useValue: {
      renderer: renderer,
      breaks: true,
    },
  }
}
