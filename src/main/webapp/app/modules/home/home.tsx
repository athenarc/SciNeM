import './home.scss';

import React from 'react';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import {
    Button,
    Card,
    Col,
    Container,
    CustomInput,
    Input,
    Label,
    ListGroup,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Progress,
    Row,
    Spinner
} from 'reactstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IRootState } from 'app/shared/reducers';
import CytoscapeComponent from 'react-cytoscapejs';
import _ from 'lodash';
import { analysisRun, getMoreResults, getResults, getStatus } from '../analysis/analysis.reducer';
import { getDatasetSchemas } from '../datasets/datasets.reducer';
import ResultsPanel from '../analysis/results/results';
import ConstraintItem from '../constraints/constraint-item';
import MetapathPanel from '../metapath/metapath-panel';
import AutocompleteInput from '../datasets/autocomplete-input';

export interface IHomeProps extends StateProps, DispatchProps {
    loading: boolean;
    progress: number;
    progressMsg: string;
    error: string;
    docs: any;
    meta: any;
    uuid: string;
};

export class Home extends React.Component<IHomeProps> {
    readonly state: any = {
        metapath: [],
        metapathStr: '',
        neighbors: undefined,
        constraints: {},
        analysis: ['Ranking'],
        dataset: null,
        selectField: '',
        targetEntity: '',
        configurationActive: false,

        edgesThreshold: 5,
        prTol: 0.000001,
        prAlpha: 0.5,
        joinK: 100,
        joinW: 0,
        joinMinValues: 5,
        searchK: 100,
        searchW: 10,
        searchMinValues: 5
    };
    cy: any;
    polling: any;

    validMove(node) {
        // allow first move to be anywhere
        if (!this.state.neighbors) {
            return true;
        }

        return this.state.neighbors.contains(node);
    }

    animateNeighbors(node) {
        const nodes = this.cy.filter('node');

        // metapath was reset, so we can move to all nodes
        if (!node) {
            this.setState({
                neighbors: undefined
            }, () => {
                nodes.animate({
                    style: { 'background-color': 'grey', 'border-width': '0px' }
                });
            });
            return;
        }

        node.animate({
            style: { 'background-color': 'green' }
        });

        const neighbors = node.neighborhood();

        nodes.not(neighbors).animate({
            style: { 'border-width': '0px' }
        });

        nodes.not(node).animate({
            style: { 'border-width': '0px', 'background-color': 'grey' }
        });

        neighbors.animate({
            style: { 'border-color': 'red', 'border-width': '2px' }

        });

        this.setState({
            neighbors
        });
    }

    pollForResults() {
        this.polling = setInterval(() => {
            this.props.getStatus(this.props.uuid);
        }, 2000);
    }

    componentDidUpdate(prevProps) {

        // new uuid detected, start polling
        if (this.props.loading && !prevProps.loading) {
            this.pollForResults();
        } else if (prevProps.loading && !this.props.loading) {
            clearInterval(this.polling);
        }

        _.forOwn(this.props.status, (completed, analysis) => {
            if (completed && prevProps.status && !prevProps.status[analysis]
                && !this.props.progressMsg.startsWith('Warning')) {		// in that case the analysis was aborted
                this.props.getResults(analysis, this.props.uuid);
            }
        });

        if (!prevProps.schemas && this.props.schemas) {
            this.initCy();
        }

    }

    componentWillUnmount() {
        clearInterval(this.polling);
    }

    componentDidMount() {
        if (!this.props.schemas) {
            this.props.getDatasetSchemas();
        }

        if (this.cy) {
            this.initCy();
        }
    }

    tapNode(e) {

        const node = e.target;
        this.registerNode(node);
    }

    registerMultipleNodes(nodeList) {
        const temporaryMetapath = [...this.state.metapath];
        const getMetapathStr = metapath => metapath.map(n => n.data('label').substr(0, 1)).join('');
        let temporaryNeighborhood = this.state.neighbors;
        let temporaryMetapathStr = getMetapathStr(temporaryMetapath);
        nodeList.forEach(node => {
            if ((!temporaryNeighborhood) || (temporaryNeighborhood.contains(node))) {
                temporaryMetapath.push(node);
                temporaryMetapathStr = getMetapathStr(temporaryMetapath);

                temporaryNeighborhood = node.neighborhood();
            } else {
                alert('Invalid selection of metapath nodes');
                return;
            }
        });

        // At this point all node additions are valid
        // temporaryMetapath contains the updated metapath structure
        // temporaryMetapathStr contains the updated metapath
        const constraints = { ...this.state.constraints };
        nodeList.forEach(node => {
            _.forOwn(node.data('attributes'), (value) => {
                const entity = node.data('label');
                const field = value.name;

                // create constraints for node, if not already present
                if (!(entity in constraints) || !(field in constraints[entity])) {
                    this.checkAndCreateConstraints(constraints, {
                        entity,
                        field
                    }, value.type);
                }
            });
        });

        const lastNode = nodeList[nodeList.length - 1];

        const newState = { ...this.state };
        newState.metapath = temporaryMetapath;
        newState.metapathStr = temporaryMetapathStr;
        newState.constraints = constraints;

        if (this.state.selectField === '') {
            newState.selectField = lastNode.data('attributes').filter((attr) => attr.name !== 'id')[0].name;
        }

        this.setState(newState, () => {
            this.animateNeighbors(lastNode);
        });
    }

    registerNode(node) {

        if (!this.validMove(node)) {
            alert('This selection is not allowed, please select on of the nodes denoted with green color');
            return;
        }

        // set metapath
        const metapath = [...this.state.metapath];	// copy array
        metapath.push(node);
        const metapathStr = metapath.map(n => n.data('label').substr(0, 1)).join('');

        // set constraints
        const constraints = { ...this.state.constraints };
        // const attrs = node.data('attributes').filter(n => (n.name !== 'id'));
        _.forOwn(node.data('attributes'), (value) => {
            const entity = node.data('label');
            const field = value.name;

            // create constraints for node, if not already present
            if (!(entity in constraints) || !(field in constraints[entity])) {
                this.checkAndCreateConstraints(constraints, {
                    entity,
                    field
                }, value.type);
            }
        });

        const newState = { ...this.state };
        newState.metapath = metapath;
        newState.metapathStr = metapathStr;
        newState.constraints = constraints;

        // select first attribute from the options
        if (this.state.selectField === '') {
            newState.selectField = node.data('attributes').filter((attr) => attr.name !== 'id')[0].name;
        }

        this.setState(newState, () => {
            this.animateNeighbors(node);
        });

    }

    addMultiple(idList) {
        const nodeList = idList.map(id => {
            const results = this.cy.filter(`[id="${id}"]`);
            return results[0];
        });
        this.registerMultipleNodes(nodeList);
    }

    simulateClickOnNode(id) {
        const results = this.cy.filter(`[id="${id}"]`);
        if (results.length > 0) {
            const node = results[0];
            this.registerNode(node);
        }
    }

    initCy() {
        // center align graph
        this.cy.center();

        // init all nodes with grey color
        const nodes = this.cy.filter('node');
        nodes.animate({
            style: { 'background-color': 'grey', 'border-width': '0px' }
        });

        // change state and animate on node click
        this.cy.on('tap', 'node', (e) => this.tapNode(e));
    }

    /**
     * Delete last character of the metapath
     */
    deleteLast() {

        const metapath = [...this.state.metapath];	// copy array
        metapath.pop();
        const metapathStr = metapath.map(n => n.data('label').substr(0, 1)).join('');

        const node = metapath[metapath.length - 1];

        // keep constraints for nodes that are in the metapath
        const constraints = {};
        _.forOwn(this.state.constraints, (entityConstraint, entity) => {
            const e = entity.substr(0, 1);
            if (metapathStr.includes(e)) {
                constraints[entity] = entityConstraint;
            }
        });

        const newState = { ...this.state };
        newState.metapath = metapath;
        newState.metapathStr = metapathStr;
        newState.constraints = constraints;

        // clear select field when metapath is deleted
        if (metapath.length === 0) {
            newState.selectField = '';
        }

        this.setState(newState, () => {
            this.animateNeighbors(node);
        });
    }

    checkAndCreateConstraints(constraints, { entity, field }, type = null, logicOp = undefined, conditionOp = '=', val = null) {
        if (!(entity in constraints)) {
            constraints[entity] = {};
        }

        // create object for attribute, if not present
        if (!(field in constraints[entity])) {
            constraints[entity][field] = {
                nextIndex: 0,
                enabled: true,
                type,
                conditions: []
            };
        }

        const index = constraints[entity][field]['nextIndex'];
        constraints[entity][field]['nextIndex'] += 1;

        const found = constraints[entity][field]['conditions'].includes(c => c.index === index);
        if (!found) {
            constraints[entity][field]['conditions'].push({
                index,
                value: val,
                operation: conditionOp,
                logicOp: logicOp ? logicOp : (index > 1) ? 'or' : undefined
            });
        }
    }

    handleConstraintOpDropdown({ entity, field, index }, value) {
        const constraints = { ...this.state.constraints };
        const found = constraints[entity][field]['conditions'].find(c => c.index === index);
        if (found) {
            found['operation'] = value;
        }

        this.setState({
            constraints
        });
    }

    getSelectFieldOptions() {
        if (this.state.metapath.length === 0) {
            return { selectedEntity: '', selectFieldOptions: [] };
        }

        const selectFieldOptions = [];
        const firstNode = this.state.metapath[0];

        const selectedEntity = firstNode.data('label');
        _.forOwn(firstNode.data('attributes'), (value, key) => {
            if (value.name !== 'id') {
                selectFieldOptions.push(
                    <option key={key} value={value.name}>{value.name} (:{value.type})</option>
                );
            }
        });

        return { selectedEntity, selectFieldOptions };
    }

    handleConstraintLogicOpDropdown({ entity, field, index }, value) {
        const constraints = { ...this.state.constraints };
        const found = constraints[entity][field]['conditions'].find(c => c.index === index);
        if (found) {
            found['logicOp'] = value;
        }

        this.setState({
            constraints
        });
    }

    handleConstraintInputChange({ entity, field, index }, value) {

        const constraints = { ...this.state.constraints };

        const found = constraints[entity][field]['conditions'].find(c => c.index === index);
        if (found) {
            found['value'] = value;
        }

        this.setState({
            constraints
        });
    }

    handleMultipleConditionsAddition({ entity, field }, conditionsList) {
        const constraints = { ...this.state.constraints };

        conditionsList.forEach(condition => {
            this.checkAndCreateConstraints(constraints, {
                entity,
                field
            }, null, condition.logicOp, condition.operation, condition.value);
        });
        this.setState({
            constraints
        });
    }

    handleConstraintAddition({ entity, field }, logicOp, conditionOp, value) {
        const constraints = { ...this.state.constraints };

        this.checkAndCreateConstraints(constraints, { entity, field }, null, logicOp, conditionOp, value);
        this.setState({
            constraints
        });
    }

    handleConstraintRemoval({ entity, field, index }) {
        const constraints = { ...this.state.constraints };

        // constraints[entity][field]['conditions'] = constraints[entity][field]['conditions'].filter(n => n.index !== index);
        const newConditions = [];
        let deleted = false;
        constraints[entity][field]['conditions'].forEach(constraintObject => {
            if (constraintObject.index !== index) {
                if (deleted) {
                    constraintObject.index--;
                }
                newConditions.push(constraintObject);
            } else {
                deleted = true;
            }
        });
        constraints[entity][field]['conditions'] = newConditions;
        constraints[entity][field]['nextIndex'] = constraints[entity][field]['conditions'].length;
        this.setState({
            constraints
        });
    }

    execute(e, rerunAnalysis) {

        const analysisType = (rerunAnalysis) ? rerunAnalysis : this.state.analysis;
        let datasetToUse;
        if (this.state.dataset === null) {
            datasetToUse = Object.keys(this.props.schemas)[0];
        } else {
            datasetToUse = this.state.dataset;
        }

        this.props.analysisRun(
            analysisType,
            this.state.metapathStr,
            this.getJoinPath(),
            this.state.constraints,
            this.props.schemas[datasetToUse]['folder'],
            this.state.selectField,
            this.state.targetEntity,
            this.state.edgesThreshold,
            this.state.prAlpha,
            this.state.prTol,
            this.state.joinK,
            this.state.joinW,
            this.state.joinMinValues,
            this.state.searchK,
            this.state.searchW,
            this.state.searchMinValues,
            (rerunAnalysis) ? 15 : undefined,
            (rerunAnalysis) ? 1 : undefined
        );
    }

    runExample(e) {

        const newState = { ...this.state };

        const nodes = this.cy.filter('node');

        switch (this.state.analysis) {
            case 'ranking': {
                const node = nodes.select('label=MiRNA');

                newState.dataset = 'Bio';
                newState.metapathStr = 'MGDGM';
                newState.selectField = 'name';
                newState.constraints = {
                    'Disease': {
                        'name': {
                            'nextIndex': 1,
                            'enabled': true,
                            'type': 'string',
                            'conditions': [{ 'index': 0, 'value': 'Adenocarcinoma', 'operation': '=' }]
                        }
                    }
                };
                break;
            }
            case 'simjoin':
                newState.dataset = 'DBLP';
                newState.metapathStr = 'VPTPV';
                newState.selectField = 'name';
                break;
            case 'simsearch':
                newState.dataset = 'DBLP';
                newState.metapathStr = 'VPAPV';
                newState.selectField = 'name';
                newState.targetEntity = 360;
                break;
            default:
                alert('This type of analysis will be implemented soon');
        }

        this.setState(newState, () => {
            this.changeSchema();
            this.execute(e, null);
        });
    }

    loadMoreResults(analysis, nextPage) {
        this.props.getMoreResults(analysis, this.props.uuid, nextPage);
    }

    handleAnalysisDropdown(e) {
        this.setState({
            analysis: e.target.value,
            targetEntity: ''
        });
    }

    onCheckboxBtnClick(selected) {
        const newState = { ...this.state };

        const index = newState.analysis.indexOf(selected);
        if (index < 0) {
            newState.analysis.push(selected);
        } else {
            newState.analysis.splice(index, 1);
        }
        this.setState(newState);
    }

    handleConstraintSwitch({ entity, field }) {
        // create object for entity, if not present
        const constraints = { ...this.state.constraints };

        constraints[entity][field]['enabled'] = !constraints[entity][field]['enabled'];

        this.setState({
            constraints
        });
    }

    toggleConfiguration() {
        this.setState({
            configurationActive: !this.state.configurationActive
        });
    }

    checkMetapathDefined() {
        return this.state.metapathStr.length > 0;
    }

    checkMetapathLength() {
        const metapath = this.state.metapathStr;

        return (metapath.length >= 3);
    }

    getJoinPath() {
        const metapath = this.state.metapathStr.slice(0);
        const midPos = Math.floor(metapath.length / 2) + 1;
        return metapath.substr(0, midPos);
    }

    reverseString(str) {
        const splitString = str.split('');
        const reverseArray = splitString.reverse();
        const joinArray = reverseArray.join('');
        return joinArray;
    }

    checkSymmetricMetapath() {

        let metapath = this.state.metapathStr.slice(0);

        if (metapath.length < 3)
            return false;

        const midPos = Math.floor(metapath.length / 2);

        // if metapath length is even, remove mid character
        if (metapath.length % 2 !== 0) {
            metapath = metapath.slice(0, midPos) + metapath.slice(midPos + 1);
        }
        ;

        const firstHalf = metapath.substr(0, midPos);
        const lastHalf = metapath.substr(midPos, metapath.length - 1);
        // console.log("first " + firstHalf);
        // console.log("last " + lastHalf);
        return (firstHalf === this.reverseString(lastHalf));
    }

    checkConstraints() {
        if (this.state.analysis === 'simjoin' || this.state.analysis === 'simsearch')
            return true;

        const constraints = {};
        _.forOwn(this.state.constraints, (entityConstraint, entity) => {
            const e = entity.substr(0, 1);
            let entityConditions = [];

            _.forOwn(entityConstraint, ({ enabled, type, conditions }, field) => {
                if (enabled) {
                    entityConditions = conditions
                        .filter(element => element.value)
                        .map(element => {
                            let value;
                            if (type === 'numeric') {
                                value = parseInt(element.value, 10);
                            } else {
                                value = `'${element.value}'`;
                            }
                            return `${element.logicOp || ''} ${field} ${element.operation} ${value}`;
                        });
                }

                if (entityConditions.length > 0) {
                    constraints[e] = entityConditions.join(' ');
                }
            });
        });

        return !_.isEmpty(constraints);
    }

    getSchema() {
        const style = {
            width: '100%',
            height: '200px'
        };

        const layout = {
            name: 'cose',
            animate: false
        };

        let elements;
        let datasetToUse = null;
        // let dataset = {};
        if (this.props.schemas) {
            if (this.state.dataset === null) {
                datasetToUse = Object.keys(this.props.schemas)[0];
                // dataset = {
                //   dataset: datasetToUse
                // };
            } else {
                datasetToUse = this.state.dataset;
            }
            elements = this.props.schemas[datasetToUse]['elements'];
        } else {
            elements = null;
        }

        let schema;
        if (elements) {
            schema = <CytoscapeComponent cy={(cy) => {
                this.cy = cy;
            }} elements={elements} style={style} layout={layout} zoomingEnabled={false} />;
        } else {
            schema = <Spinner style={{ width: '200px', height: '200px', marginLeft: 'auto', marginRight: 'auto' }}
                              type="grow" color="info" />;
        }

        return schema;
    }

    changeSchema() {

        const elements = this.props.schemas[this.state.dataset]['elements'];

        this.cy.elements().remove();
        this.cy.add(elements);
        const newLayout = this.cy.layout({
            name: 'cose',
            animate: false
        });
        newLayout.run();
        this.cy.center();

    }

    resetSchemaColors() {
        const nodes = this.cy.filter('node');

        nodes.animate({
            style: { 'border-width': '0px', 'background-color': 'grey' }
        });
    }

    handleDatasetDropdown(e) {
        e.preventDefault();

        const newState = { ...this.state };
        newState.metapath = [];
        newState.metapathStr = '';
        newState.neighbors = undefined;
        newState.constraints = {};
        newState.selectField = '';
        newState.dataset = e.target.value;

        this.setState(newState, () => {
            this.changeSchema();
            this.resetSchemaColors();
        });
    }

    getDatasetOptions() {
        let options = [];
        if (this.props.schemas) {
            options = _.map(this.props.schemas, (value, key) => {
                return <option key={key} value={key}>{key}</option>;
            });
        }
        return options;
    }

    handleSelectFieldChange(e) {
        e.preventDefault();

        const newState = { ...this.state };
        newState.selectField = e.target.value;
        this.setState(newState);
    }

    handleTargetEntity(e) {

        let selected;

        if (_.isEmpty(e)) {
            selected = '';
        } else {
            [selected] = e;
            selected = selected.id;
        }

        this.setState({
            targetEntity: selected
        });
    }

    handleAdvancedOptions(e) {
        const newState = { ...this.state };
        newState[e.target.id] = e.target.value;
        this.setState(newState);
    }

    getDescriptionString() {
        if (this.props.analysesParameters) {
            const metapath = this.props.analysesParameters.metapath;
            const analyses = this.props.analysesParameters.analyses.join(', ');
            const constraints = this.props.analysesParameters.constraints.join(', ');

            let statusString = '';
            switch (this.props.analysesParameters.status) {
                case 'PENDING':
                    statusString = 'Executing';
                    break;
                case 'COMPLETE':
                    statusString = 'Completed';
                    break;
                default:
                    statusString = 'Unknown state when';
            }

            return `${statusString} ${analyses} for metapath ${metapath} and constraint(s) ${constraints}.`;
        } else {
            return '';
        }
    }

    generateNotification() {
        if (this.checkMetapathDefined()) {
            if (this.checkMetapathLength()) {
                if (this.checkSymmetricMetapath()) {
                    if (this.checkConstraints()) {
                        return <p className={'m-0'}><small className={'text-success'}>Valid metapath!</small></p>;
                    }
                    return <p className={'m-0'}><small className={'text-danger'}>At least one constraint must be
                        defined</small></p>;
                }
                return <p className={'m-0'}><small className={'text-danger'}>Metapath must be symmetric</small></p>;
            }
            return <p className={'m-0'}><small className={'text-danger'}>Metapath must contain at least 3
                entities</small></p>;
        }
        return <div></div>;
    }

    getCrudeInterpretation() {
        if (this.checkSymmetricMetapath()) {
            const targetEntity = this.state.metapath[0].data('label');
            if (this.state.metapath.length === 3) {
                const relatingEntity = this.state.metapath[1].data('label');
                return <strong><small>Metapath will retrieve <strong>{targetEntity}</strong> entities, that are
                    connected with
                    one <strong>{relatingEntity}</strong> entity.</small></strong>;
            } else {
                const relatingMetapathElements = [];
                this.state.metapath.map((entity, index) => {
                    const entityLabel = entity.data('label');
                    return <strong key={`${entityLabel}-${index}`}>{entityLabel}</strong>;
                }).forEach((element, index) => {
                    if (index > 0) {
                        relatingMetapathElements.push(<span> <FontAwesomeIcon icon={'play'} /> </span>);
                    }
                    relatingMetapathElements.push(element);
                });
                return <strong><small>Metapath will retrieve <strong>{targetEntity}</strong> entities, that are
                    connected with
                    the metapath {relatingMetapathElements}.</small></strong>;
            }
        }
        return <div></div>;
    }

    render() {
        const datasetOptions = this.getDatasetOptions();
        const schema = this.getSchema();
        const validMetapathLength = this.checkMetapathLength();
        const validMetapath = this.checkSymmetricMetapath();
        const validConstraints = this.checkConstraints();
        const validAnalysisType = this.state.analysis.length !== 0;
        const validTargetEntity = (!this.state.analysis.includes('Similarity Search') || (this.state.analysis.includes('Similarity Search') && this.state.targetEntity !== ''));
        const { selectedEntity, selectFieldOptions }: any = this.getSelectFieldOptions();
        let datasetFolder = '';
        let datasetToUse;
        console.log('Home: render() - watching state.constraints: ');
        console.log(this.state.constraints);
        if (this.props.schemas) {
            if (this.state.dataset === null) {
                datasetToUse = Object.keys(this.props.schemas)[0];
                // dataset = {
                //   dataset: datasetToUse
                // };
            } else {
                datasetToUse = this.state.dataset;
            }
            // if (this.props.schemas) {
            datasetFolder = this.props.schemas[datasetToUse]['folder'];
        }

        // const constraintsPanel = <Row>
        //     <Col md="12">
        //         <h4>Select constraints</h4>
        //     </Col>
        //     <Col md="12">
        //         {
        //             <ListGroup>
        //                 {
        //                     (this.state.metapathStr.length > 0) ?
        //                         _.map(this.state.constraints, (entityConstraints, entity) => {
        //                             return <ConstraintItem
        //                                 key={entity}
        //                                 datasetFolder={datasetFolder}
        //                                 entity={entity}
        //                                 entityConstraints={entityConstraints}
        //                                 handleSwitch={this.handleConstraintSwitch.bind(this)}
        //                                 handleDropdown={this.handleConstraintOpDropdown.bind(this)}
        //                                 handleLogicDropdown={this.handleConstraintLogicOpDropdown.bind(this)}
        //                                 handleInput={this.handleConstraintInputChange.bind(this)}
        //                                 handleAddition={this.handleConstraintAddition.bind(this)}
        //                                 handleRemoval={this.handleConstraintRemoval.bind(this)}
        //
        //                             />;
        //                         })
        //                         : 'No constraints can be applied'
        //                 }
        //             </ListGroup>
        //         }
        //         {
        //             (!validConstraints && (this.state.metapathStr.length !== 0)) &&
        //             <span className="attribute-type text-danger">
        // 				Please provide at least one constraint.
        // 		</span>
        //         }
        //     </Col>
        // </Row>;
        const rankingLabel = <span>
			Ranking <FontAwesomeIcon style={{ color: '#17a2b8' }} icon="question-circle"
                                     title="Ranking analysis is perfomed using PageRank." />
		</span>;
        const communityLabel = <span>
			Community Detection <FontAwesomeIcon style={{ color: '#17a2b8' }} icon="question-circle"
                                                 title="Community Detection analysis is perfomed using Louvain Modularity method." />
		</span>;
        const simJoinLabel = <span>
			Similarity Join <FontAwesomeIcon style={{ color: '#17a2b8' }} icon="question-circle"
                                             title="Similarity Join is perfomed using JoinSim." />
		</span>;
        const simSearchLabel = <span>
			Similarity Search <FontAwesomeIcon style={{ color: '#17a2b8' }} icon="question-circle"
                                               title="Similarity Search is perfomed using JoinSim similarity measure." />

		</span>;

        return (
            <Container fluid>
                <Row className={'justify-content-center'}>
                    <Col md="6">
                        <Row>
                            <Col md="12">
                                <Row>
                                    <Col md='8'>
                                        <h4>Working dataset</h4>
                                    </Col>
                                    <Col md='4'>
                                        <Button outline color="info" tag={Link} to="/upload" className="float-right"
                                                size='sm'>
                                            <FontAwesomeIcon icon="upload" /> Upload new
                                        </Button>
                                    </Col>
                                </Row>
                                <Input value={this.state.dataset} type="select" name="dataset" id="dataset"
                                       onChange={this.handleDatasetDropdown.bind(this)}>
                                    {datasetOptions}
                                </Input>
                            </Col>
                        </Row>
                        <br />

                        <span className={'text-secondary my-0'}>Dataset schema</span>
                        <Card className="mx-auto">
                            {schema}
                        </Card>

                        <br />
                        <h4>Select metapath</h4>
                        {(this.props.schemas) &&
                        <MetapathPanel
                            metapath={this.state.metapath}
                            schema={this.props.schemas[datasetToUse]}
                            datasetFolder={datasetFolder}
                            constraints={this.state.constraints}
                            selectFieldOptions={selectFieldOptions}
                            onNewEntity={this.simulateClickOnNode.bind(this)}
                            onRecommendationAccept={this.addMultiple.bind(this)}
                            onDelete={this.deleteLast.bind(this)}
                            handleSwitch={this.handleConstraintSwitch.bind(this)}
                            handleDropdown={this.handleConstraintOpDropdown.bind(this)}
                            handleLogicDropdown={this.handleConstraintLogicOpDropdown.bind(this)}
                            handleInput={this.handleConstraintInputChange.bind(this)}
                            handleAddition={this.handleConstraintAddition.bind(this)}
                            handleRemoval={this.handleConstraintRemoval.bind(this)}
                            handleSelectFieldChange={this.handleSelectFieldChange.bind(this)}
                            handleMultipleAddition={this.handleMultipleConditionsAddition.bind(this)} />
                        }
                        {/* <MetapathControl metapath={this.state.metapath} onEntityRemove={this.deleteLast.bind(this)} neighbors={this.state.neighbors} /> */}
                    </Col>
                </Row>
                {this.checkMetapathDefined() &&
                <Row className={'justify-content-center mt-1'}>
                    <Col md={'6'}>
                        <div className={'balloon bg-light-grey'}>
                            <div>
                                {this.generateNotification()}
                            </div>
                            {this.checkSymmetricMetapath() &&
                            <div>
                                <hr className={'m-0'} />
                                <div>
                                    <p className={'m-0'}>
                                        {this.getCrudeInterpretation()}
                                    </p>
                                </div>
                            </div>
                            }
                        </div>
                    </Col>
                </Row>
                }
                <Row className={'justify-content-center'}>
                    <Col md="6">
                        <br />
                        <Row>
                            <Col md="12">
                                <Row>
                                    <Col md='8'>
                                        <h4>Select analysis type</h4>
                                    </Col>
                                    <Col md='4'>
                                        <Button outline size='sm' color="info" title="Advanced Options"
                                                className="float-right" active={this.state.configurationActive}
                                                onClick={this.toggleConfiguration.bind(this)}>
                                            <FontAwesomeIcon icon="cogs" /> Configuration
                                        </Button>
                                        <Modal isOpen={this.state.configurationActive}
                                               toggle={this.toggleConfiguration.bind(this)} className={'w-75 mw-100'}>
                                            <ModalHeader>
                                                Analysis configuration
                                            </ModalHeader>
                                            <ModalBody>
                                                <Container>
                                                    <Row>
                                                        <Col md='3'>
                                                            <Card className={'configuration-card'}>
                                                                <h5>General</h5>

                                                                <Label for="edgesThreshold">
                                                                    Minimum number of instances for a metapath-based
                                                                    connection to be considered <FontAwesomeIcon
                                                                    style={{ color: '#17a2b8' }} icon="question-circle"
                                                                    title="Connections with fewer occurences are not considered in the analysis; it affects the overall efficiency." />
                                                                </Label>
                                                                <Input id="edgesThreshold"
                                                                       value={this.state.edgesThreshold}
                                                                       bsSize="sm" type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.edgesThreshold === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                            </Card>
                                                        </Col>
                                                        <Col md='3'>
                                                            <Card className={'configuration-card'}>
                                                                <h5>Ranking</h5>
                                                                <Label for="edgesThreshold">
                                                                    Alpha <FontAwesomeIcon style={{ color: '#17a2b8' }}
                                                                                           icon="question-circle"
                                                                                           title="The random reset propability of the PageRank algorithm." />
                                                                </Label>
                                                                <Input id="prAlpha" value={this.state.prAlpha}
                                                                       bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.prAlpha === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                                <br />
                                                                <Label for="edgesThreshold">
                                                                    Tolerance <FontAwesomeIcon
                                                                    style={{ color: '#17a2b8' }}
                                                                    icon="question-circle"
                                                                    title="The tolerance allowed for convergence." />
                                                                </Label>
                                                                <Input id="prTol" value={this.state.prTol} bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.prTol === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                            </Card>
                                                        </Col>
                                                        <Col md='3'>
                                                            <Card className={'configuration-card'}>
                                                                <h5>Similarity Join</h5>

                                                                <Label for="joinK">
                                                                    k <FontAwesomeIcon style={{ color: '#17a2b8' }}
                                                                                       icon="question-circle"
                                                                                       title="Number of retrieved results." />
                                                                </Label>
                                                                <Input id="joinK" value={this.state.joinK} bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.joinK === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                                <br />
                                                                <Label for="joinW">
                                                                    w <FontAwesomeIcon style={{ color: '#17a2b8' }}
                                                                                       icon="question-circle"
                                                                                       title="Hamming distance threshold for merging buckets." />
                                                                </Label>
                                                                <Input id="joinW" value={this.state.joinW} bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.joinW === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                                <br />
                                                                <Label for="joinMinValues">
                                                                    Min. values <FontAwesomeIcon
                                                                    style={{ color: '#17a2b8' }} icon="question-circle"
                                                                    title="Min number of values for each entity." />
                                                                </Label>
                                                                <Input id="joinMinValues"
                                                                       value={this.state.joinMinValues}
                                                                       bsSize="sm" type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.joinMinValues === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                            </Card>

                                                        </Col>
                                                        <Col md='3'>
                                                            <Card className={'configuration-card'}>
                                                                <h5>Similarity Search</h5>

                                                                <Label for="searchK">
                                                                    k <FontAwesomeIcon style={{ color: '#17a2b8' }}
                                                                                       icon="question-circle"
                                                                                       title="Number of retrieved results." />
                                                                </Label>
                                                                <Input id="searchK" value={this.state.searchK}
                                                                       bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.searchK === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                                <br />
                                                                <Label for="searchW">
                                                                    w <FontAwesomeIcon style={{ color: '#17a2b8' }}
                                                                                       icon="question-circle"
                                                                                       title="Hamming distance threshold for merging buckets." />
                                                                </Label>
                                                                <Input id="searchW" value={this.state.searchW}
                                                                       bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.searchW === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                                <br />
                                                                <Label for="searchMinValues">
                                                                    Min. values <FontAwesomeIcon
                                                                    style={{ color: '#17a2b8' }} icon="question-circle"
                                                                    title="Min number of values for each entity." />
                                                                </Label>
                                                                <Input id="searchMinValues"
                                                                       value={this.state.searchMinValues} bsSize="sm"
                                                                       type='number'
                                                                       onChange={this.handleAdvancedOptions.bind(this)} />
                                                                {
                                                                    (this.state.searchMinValues === '') &&
                                                                    <span className="attribute-type text-danger">
																This field cannot be empty.
												</span>
                                                                }
                                                            </Card>

                                                        </Col>
                                                    </Row>
                                                </Container>
                                            </ModalBody>
                                            <ModalFooter>
                                                <Button color={'info'}
                                                        onClick={this.toggleConfiguration.bind(this)}><FontAwesomeIcon
                                                    icon={'save'} /> Save</Button>
                                            </ModalFooter>
                                        </Modal>
                                    </Col>
                                </Row>
                            </Col>
                        </Row>
                        <Row>
                            <Col md='6'>
                                <Row>
                                    <Col>
                                        <CustomInput type="switch" id="rankingSwith"
                                                     onChange={() => this.onCheckboxBtnClick('Ranking')}
                                                     checked={this.state.analysis.includes('Ranking')}
                                                     label={rankingLabel} />
                                    </Col>
                                </Row>
                                <Row>
                                    <Col>
                                        <CustomInput type="switch" id="simJoinSwitch"
                                                     onChange={() => this.onCheckboxBtnClick('Similarity Join')}
                                                     checked={this.state.analysis.includes('Similarity Join')}
                                                     label={simJoinLabel} />
                                    </Col>
                                </Row>
                            </Col>
                            <Col md={'6'}>
                                <Row>
                                    <Col xs={'12'}>
                                        <CustomInput type="switch" id="simSearchSwitch"
                                                     onChange={() => this.onCheckboxBtnClick('Similarity Search')}
                                                     checked={this.state.analysis.includes('Similarity Search')}
                                                     label={simSearchLabel} />
                                    </Col>
                                    {
                                        (this.state.analysis.includes('Similarity Search')) &&
                                        <Col xs={'12'}>
                                            <AutocompleteInput
                                                id="targetEntityInput"
                                                placeholder={_.isEmpty(this.state.metapath) ? 'First, select a metapath' : `Search for ${selectedEntity} entities`}
                                                onChange={this.handleTargetEntity.bind(this)}
                                                entity={selectedEntity}
                                                field={this.state.selectField}
                                                folder={datasetFolder}
                                                disabled={_.isEmpty(this.state.metapath)}
                                                size='sm'
                                            />
                                            {
                                                (this.state.targetEntity === '') &&
                                                <span className="attribute-type text-danger">
                                                    This field cannot be empty when Similarity Search is enabled.
                                                </span>
                                            }
                                        </Col>

                                    }
                                </Row>
                                <Row>
                                    <Col>
                                        <CustomInput type="switch" id="cdSwitch"
                                                     onChange={() => this.onCheckboxBtnClick('Community Detection')}
                                                     checked={this.state.analysis.includes('Community Detection')}
                                                     label={communityLabel} />
                                    </Col>
                                </Row>
                                {
                                    (!validAnalysisType) &&
                                    <Col md={'6'} className="attribute-type text-danger">
                                        Please select at least one type of analysis.
                                    </Col>
                                }

                            </Col>
                        </Row>
                    </Col>
                </Row>
                <Row>
                    <Col md='12' style={{ paddingTop: '20px' }}>
                        <Row>
                            <Col md={{ size: 2, offset: 5 }}>
                                <Button block color="success"
                                        disabled={this.props.loading || !validMetapath || !validConstraints || !validTargetEntity}
                                        onClick={this.execute.bind(this)}>
                                    <FontAwesomeIcon icon="play" /> Execute analysis
                                </Button>
                            </Col>
                        </Row>
                    </Col>
                </Row>
                <Row>
                    <Col md='12'>
                        <Container>
                            {this.props.uuid &&
                            <Card className={'my-4 pt-0'}>
                                <Row className={'justify-content-end'}>
                                    <h5 className={'p-2'}><strong className={'text-muted'}>Job
                                        ID: {this.props.uuid}</strong></h5>
                                </Row>
                                <br />
                                {this.props.error &&
                                <Row>
                                    <Col xs={'12'} className={'text-danger'}>{this.props.error}</Col>
                                </Row>
                                }
                                {
                                    ((this.props.description || '').startsWith('Warning')) &&
                                    <Row className="small-red text-center">
                                        <Col>
                                            {this.props.description}
                                        </Col>
                                    </Row>
                                }
                                {
                                    (this.props.loading) &&
                                    <Row className="small-grey text-center">
                                        <Col>
                                            The analysis may take some time, you can check its progress in the
                                            following <Link to={`/jobs/${this.props.uuid}`}
                                                            target="_blank">link</Link> (job
                                            id = {this.props.uuid}).<br />
                                            {this.getDescriptionString()}
                                        </Col>
                                    </Row>
                                }
                                {
                                    (this.props.loading) && <Progress animated color="info"
                                                                      value={this.props.progress}>{this.props.progressMsg}</Progress>
                                }
                                <ResultsPanel
                                    uuid={this.props.uuid}
                                    description={this.getDescriptionString()}
                                    results={this.props.results}
                                    analysis={this.props.analysis}
                                    analysisId={this.props.uuid}
                                    loadMore={this.loadMoreResults.bind(this)}
                                    rerun={this.execute.bind(this)}
                                />
                            </Card>
                            }
                        </Container>
                    </Col>
                </Row>
            </Container>
        );
    }
};

const mapStateToProps = (storeState: IRootState) => ({
    loading: storeState.analysis.loading,
    status: storeState.analysis.status,
    progress: storeState.analysis.progress,
    progressMsg: storeState.analysis.progressMsg,
    description: storeState.analysis.description,
    analysesParameters: storeState.analysis.analysesParameters,
    error: storeState.analysis.error,
    results: storeState.analysis.results,
    uuid: storeState.analysis.uuid,
    analysis: storeState.analysis.analysis,
    schemas: storeState.datasets.schemas
});

const mapDispatchToProps = {
    analysisRun,
    // simjoinRun,
    // simsearchRun,
    getStatus,
    getResults,
    getMoreResults,
    getDatasetSchemas
};

type StateProps = ReturnType<typeof mapStateToProps>;
type DispatchProps = typeof mapDispatchToProps;

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Home);



