import cockpit from 'cockpit';
import varlink from './varlink.js';

const _ = cockpit.gettext;

export const PODMAN_SYSTEM_ADDRESS = "unix:/run/podman/io.podman"; // TODO should be possible to remove

/*
 * Podman returns dates in the format that golang's time.String() exports. Use
 * this format specifier for converting that to moment.js time, e.g.:
 *
 *     moment(date, util.GOLANG_TIME_FORMAT)
 *
 * https://github.com/containers/libpod/issues/2260
 */
export const GOLANG_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss.S Z'; // TODO should be possible to remove

export function truncate_id(id) {
    if (!id) {
        return "";
    }
    return _(id.substr(0, 12));
}

export function format_cpu_percent(cpu, precpu) { // TODO - https://github.com/containers/libpod/pull/5178
    if (cpu === undefined || precpu === undefined) {
        return "";
    }

    let cpuPercent = 0;
    const cpuDelta = cpu.cpu_usage.total_usage - precpu.cpu_usage.total_usage;
    let systemDelta = cpu.system_usage - precpu.system_usage;

    // https://github.com/moby/moby/blob/eb131c5383db8cac633919f82abad86c99bffbe5/cli/command/container/stats_helpers.go#L175
    // https://github.com/containers/libpod/pull/4423/files
    // TODO system_usage is not on the protocol but gonna hopefully use #5178
    systemDelta = 0;

    if (cpuDelta > 0 && systemDelta > 0) {
        cpuPercent = (cpuDelta / systemDelta) * (cpu.cpu_usage.percpu_usage.length * 100);
    }

    return cpuPercent.toFixed() + "%";
}

export function format_memory_and_limit(usage, limit) {
    if (usage === undefined || isNaN(usage))
        return "";

    usage = usage / 1073741824; // 1024^3
    limit = limit / 1073741824;
    var mtext = "";
    var units = 1024;
    var parts;
    if (limit) {
        parts = cockpit.format_bytes(limit, units, true);
        mtext = " / " + parts.join(" ");
        units = parts[1];
    }

    if (usage) {
        parts = cockpit.format_bytes(usage, units, true);
        if (mtext)
            return _(parts[0] + mtext);
        else
            return _(parts.join(" "));
    } else {
        return "";
    }
}

// ------------------------- REMOVE FROM HERE ---------------------
export function getAddress(system) {
    if (system)
        return PODMAN_SYSTEM_ADDRESS;
    const xrd = sessionStorage.getItem('XDG_RUNTIME_DIR');
    if (xrd)
        return ("unix:" + xrd + "/podman/io.podman");
    console.warn("$XDG_RUNTIME_DIR is not present. Cannot use user service.");
    return "";
}

export function podmanCall(name, args, system) {
    return varlink.call(getAddress(system), "io.podman." + name, args, system);
}

export function monitor(name, args, callback, on_close, system) {
    return varlink.connect(getAddress(system), system)
            .then(connection => connection.monitor("io.podman." + name, args, callback))
            .catch(e => {
                if (e.name === "ConnectionClosed")
                    on_close(system);
                else
                    throw e;
            });
}

export function getCommitArr(arr, cmd) {
    const ret = [];
    if (cmd === "ONBUILD") {
        for (let i = 0; i < arr.length; i++) {
            const temp = "ONBUILD=" + arr[i];
            ret.push(temp);
        }
    }
    return ret;
}

// --------------------------- TO HERE ----------------

/*
 * The functions quote_cmdline and unquote_cmdline implement
 * a simple shell-like quoting syntax.  They are used when letting the
 * user edit a sequence of words as a single string.
 *
 * When parsing, words are separated by whitespace.  Single and double
 * quotes can be used to protect a sequence of characters that
 * contains whitespace or the other quote character.  A backslash can
 * be used to protect any character.  Quotes can appear in the middle
 * of a word.
 *
 * This comes from cockpit-project/cockpit docker package. Changes should be
 * made there and then backported here.
 */

export function quote_cmdline(words) {
    words = words || [];

    function is_whitespace(c) {
        return c == ' ';
    }

    function quote(word) {
        var text = "";
        var quote_char = "";
        var i;
        for (i = 0; i < word.length; i++) {
            if (word[i] == '\\' || word[i] == quote_char)
                text += '\\';
            else if (quote_char === "") {
                if (word[i] == "'" || is_whitespace(word[i]))
                    quote_char = '"';
                else if (word[i] == '"')
                    quote_char = "'";
            }
            text += word[i];
        }

        return quote_char + text + quote_char;
    }

    return words.map(quote).join(' ');
}

export function unquote_cmdline(text) {
    var words = [];
    var next;

    function is_whitespace(c) {
        return c == ' ';
    }

    function skip_whitespace() {
        while (next < text.length && is_whitespace(text[next]))
            next++;
    }

    function parse_word() {
        var word = "";
        var quote_char = null;

        while (next < text.length) {
            if (text[next] == '\\') {
                next++;
                if (next < text.length) {
                    word += text[next];
                }
            } else if (text[next] == quote_char) {
                quote_char = null;
            } else if (quote_char) {
                word += text[next];
            } else if (text[next] == '"' || text[next] == "'") {
                quote_char = text[next];
            } else if (is_whitespace(text[next])) {
                break;
            } else
                word += text[next];
            next++;
        }
        return word;
    }

    next = 0;
    skip_whitespace();
    while (next < text.length) {
        words.push(parse_word());
        skip_whitespace();
    }

    return words;
}

/*
 * Return 1 if first argument is newer version, 0 if they are equal and -1 otherwise.
 * Both arguments are required to be strings, in form `\d(\.\d)*`.
 * Taken from cockpit `pkg/storaged/utils.js`.
 */
export function compare_versions(a, b) {
    function to_ints(str) {
        return str.split(".").map(function (s) { return s ? parseInt(s, 10) : 0 });
    }

    var a_ints = to_ints(a);
    var b_ints = to_ints(b);
    var len = Math.min(a_ints.length, b_ints.length);
    var i;

    for (i = 0; i < len; i++) {
        if (a_ints[i] == b_ints[i])
            continue;
        return a_ints[i] - b_ints[i];
    }

    return a_ints.length - b_ints.length;
}
