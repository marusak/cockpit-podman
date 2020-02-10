import React from 'react';
import cockpit from 'cockpit';
import * as utils from './util.js';
import * as Listing from '../lib/cockpit-components-listing.jsx';

const _ = cockpit.gettext;

const renderRow = (containerStats, container, showAll) => {
    const isRunning = container.State == "running";
    let proc = "";
    let mem = "";
    if (containerStats) {
        proc = containerStats.cpu_stats && containerStats.precpu_stats ? utils.format_cpu_percent(containerStats.cpu_stats, containerStats.precpu_stats) : <abbr title={_("not available")}>{_("n/a")}</abbr>;
        mem = containerStats.memory_stats ? utils.format_memory_and_limit(containerStats.memory_stats.usage, containerStats.memory_stats.limit) : <abbr title={_("not available")}>{_("n/a")}</abbr>;
    }

    const columns = [
        { name: container.names, header: true },
        utils.quote_cmdline(container.command),
        proc,
        mem,
        container.State /* TODO: i18n */,

    ];
    return <Listing.ListingRow
                navigateToItem={() => {
                    const loc = document.location.toString().split('#')[0];
                    document.location = loc + '#' + container.id;
                    if (!isRunning)
                        showAll();
                    return false;
                }}
                key={"usedby-" + container.id}
                rowId={"usedby-" + container.id}
                columns={columns}
    />;
};

const ImageUsedBy = (props) => {
    const columnTitles = [_("Name"), _("Command"), _("CPU"), _("Memory"), _("State")];
    let emptyCaption = _("No containers are using this image");
    const containers = [];
    let cs = props.containers;

    if (cs === undefined)
        cs = [];

    if (cs !== null) {
        cs.forEach(c => {
            containers.push(renderRow(c.stats, c.container, props.showAll));
        });
    } else {
        emptyCaption = _("Loading...");
    }

    return (
        <Listing.Listing columnTitles={columnTitles} emptyCaption={emptyCaption}>
            { containers }
        </Listing.Listing>
    );
};

export default ImageUsedBy;
