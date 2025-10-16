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
          const iconStyle = isShorts
            ? 'position: absolute; place-self: anchor-center; color: red; font-size: 50px;'
            : 'position: absolute; place-self: anchor-center; color: red; font-size: 70px;';

          return `<div style="${containerStyle}">
            <img youtubeid="${id}" ${isShorts ? 'isshorts="true"' : ''} src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" class="img-fluid" style="${imgStyle}">
            <i class="bi bi-youtube" youtubeid="${id}" ${isShorts ? 'isshorts="true"' : ''} style="${iconStyle}"></i>
          </div>`;
        default:
          return '';
      }
    }
  }]
}

const renderer = new MarkedRenderer();

renderer.link = ({ href, title, text }) => {
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