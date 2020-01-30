/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React from 'react';
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { Terminal } from "xterm";

import * as utils from './util.js';
import varlink from './varlink.js';

import "./ContainerTerminal.css";

const _ = cockpit.gettext;

class ContainerTerminal extends React.Component {
    constructor(props) {
        super(props);

        this.onChannelClose = this.onChannelClose.bind(this);
        this.onChannelMessage = this.onChannelMessage.bind(this);
        this.disconnectChannel = this.disconnectChannel.bind(this);
        this.connectChannel = this.connectChannel.bind(this);
        this.resize = this.resize.bind(this);

        const term = new Terminal({
            cols: 80,
            rows: 24,
            screenKeys: true,
            cursorBlink: true,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, Consolas, monospace',
            screenReaderMode: true
        });

        this.state = {
            term: term,
            container: props.containerId,
            channel: null,
            opened: false,
            errorMessage: "",
            cols: 80,
        };
    }

    componentDidMount() {
        this.connectChannel();
    }

    componentDidUpdate(prevProps, prevState) {
        if (!this.state.channel && this.props.containerStatus === "running" && prevProps.containerStatus !== "running")
            this.connectChannel();
        if (prevProps.width !== this.props.width) {
            this.resize(this.props.width);
        }
    }

    resize(width) {
        var padding = 11 + 5 + 50;
        var realWidth = this.state.term._core._renderCoordinator.dimensions.actualCellWidth;
        var cols = Math.floor((width - padding) / realWidth);
        this.state.term.resize(cols, 24);
        // TODO resize
        this.setState({ cols: cols });
    }

    connectChannel() {
        const self = this;
        if (self.state.channel)
            return;

        if (self.props.containerStatus !== "running") {
            const message = _("Container is not running");
            this.setState({ errorMessage: message });
            return;
        }

        let logsData = {};
        logsData.name = this.props.containerId;
        logsData.tty = true;
        logsData.cmd = ["sh"];
        logsData = { opts: logsData };

        varlink.connect(utils.getAddress(this.props.system), this.props.system, true)
                .then(connection => {
                    // Show the terminal. Once it was shown, do not show it again but reuse the previous one
                    if (!this.state.opened) {
                        this.state.term.open(this.refs.terminal);
                        this.setState({ opened: true });
                    }

                    self.state.term.on('data', function(data) {
                        if (self.state.channel) {
                            self.state.channel.write_raw(data); // TODO: does not work
                        }
                    });

                    connection.monitor("io.podman.ExecContainer", logsData, this.onChannelMessage)
                            .then(this.onChannelClose)
                            .catch(e => {
                                if (e.error === "ConnectionClosed")
                                    this.onChannelClose();
                                else
                                    this.setState({
                                        errorMessage: e.message,
                                        channel: null,
                                    });
                            });
                    this.setState({
                        channel: connection,
                        errorMessage: "",
                    });
                })
                .catch(e => {
                    this.setState({
                        errorMessage: e.message,
                        channel: null,
                    });
                });
        // TODO proper errors
        // TODO on willUnmount close the channel
    }

    componentWillUnmount() {
        this.disconnectChannel();
        if (this.state.channel)
            this.state.channel.close();
        this.state.term.destroy();
    }

    onChannelMessage(data) {
        if (data)
            this.state.term.write(data.join(""));
    }

    onChannelClose(event, options) {
        var term = this.state.term;
        term.write('\x1b[31m disconnected \x1b[m\r\n');
        this.disconnectChannel();
        this.setState({ channel: null });
        term.cursorHidden = true;
    }

    disconnectChannel() {
        // TODO same as in Logs
        if (this.state.channel) {
            console.log("Closing");
        }
    }

    render() {
        let element = <div className="container-terminal" ref="terminal" />;
        if (this.state.errorMessage)
            element = (<div ref="terminal" className="empty-state">
                <span className="empty-message">
                    { this.state.errorMessage }
                </span>
            </div>
            );

        return (
            <>
                { element }
            </>
        );
    }
}

ContainerTerminal.propTypes = {
    containerId: PropTypes.string.isRequired,
    containerStatus: PropTypes.string.isRequired
};

export default ContainerTerminal;
